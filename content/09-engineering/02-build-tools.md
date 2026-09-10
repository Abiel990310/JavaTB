---
title: "Build tools — what Maven and Gradle are actually doing"
navTitle: "Build tools"
summary: >-
  A jar is a zip with a manifest, a build is javac plus bookkeeping, and the hard part is deciding which version of a library you get.
objectives:
  - Say what a build tool does that javac does not
  - Build and read a jar, and explain what makes it executable
  - Resolve a dependency conflict by both common strategies and see them disagree
  - Compare versions correctly and pin them deliberately
status: complete
standard: java21
requires: [testing]
---

Everything in this book so far has compiled with one command over one file.
Real projects do not, and the reason is not that `javac` cannot cope. It is
that four other jobs come with it: finding the libraries you depend on,
finding *their* libraries, packaging the result, and doing all of it the same
way on every machine.

## What a jar is

```java run title="A jar, built and read without touching the disk"
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.jar.*;
import java.util.zip.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Manifest manifest = new Manifest();
        Attributes attributes = manifest.getMainAttributes();
        attributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
        attributes.put(Attributes.Name.MAIN_CLASS, "com.example.App");
        attributes.put(new Attributes.Name("Class-Path"), "lib/util.jar lib/json.jar");
        attributes.put(new Attributes.Name("Implementation-Version"), "1.4.2");

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (JarOutputStream jar = new JarOutputStream(bytes, manifest)) {
            jar.putNextEntry(new JarEntry("com/example/App.class"));
            jar.write("(pretend this is bytecode)".getBytes(StandardCharsets.UTF_8));
            jar.closeEntry();

            jar.putNextEntry(new JarEntry("com/example/messages.properties"));
            jar.write("greeting=hello\n".getBytes(StandardCharsets.UTF_8));
            jar.closeEntry();
        }
        System.out.println("built a jar of " + bytes.size() + " bytes");

        try (JarInputStream in = new JarInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            Attributes read = in.getManifest().getMainAttributes();
            System.out.println("Main-Class:  " + read.getValue(Attributes.Name.MAIN_CLASS));
            System.out.println("Class-Path:  " + read.getValue("Class-Path"));
            System.out.println("Version:     " + read.getValue("Implementation-Version"));

            JarEntry entry;
            while ((entry = in.getNextJarEntry()) != null) {
                String content = new String(in.readAllBytes(), StandardCharsets.UTF_8).trim();
                System.out.println("  " + entry.getName() + "  ->  " + content);
            }
        }

        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            List<String> names = new ArrayList<>();
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                names.add(entry.getName());
            }
            System.out.println("the same file, read as a plain zip: " + names);
        }
    }
}
```

A jar is a **zip file with a `META-INF/MANIFEST.MF` entry**. `unzip` will open
one, and `jar tf` is a zip listing with a nicer name. There is no other magic.

The manifest is a small key-value file, and three of its keys matter:

- **`Main-Class`** is what makes `java -jar app.jar` work. Without it you get
  *no main manifest attribute*, which is the error every first
  packaging attempt produces.
- **`Class-Path`** lists other jars, relative to this one. It is how a jar
  declares its own dependencies without a build tool — rarely used now, but it
  is why an executable jar can be tiny or enormous depending on whether the
  dependencies are listed or copied in.
- **`Implementation-Version`** and friends are informational, and they are
  where a library's version goes when someone asks it at run time.

Copying the dependencies *inside* the jar gives a **fat jar** (or "uber jar"),
which Maven's shade plugin and Gradle's shadow plugin exist to build. It works,
and it makes two libraries that both ship `META-INF/services/...` fight over
the same entry — which is why the plugins have merge strategies.

## What a build tool adds to `javac`

By hand, building a project is:

```
javac -d target/classes $(find src/main/java -name '*.java') -cp lib/a.jar:lib/b.jar
javac -d target/test-classes $(find src/test/java -name '*.java') -cp target/classes:lib/junit.jar
java  -cp target/test-classes:target/classes:lib/... org.junit.platform.console.ConsoleLauncher
jar   --create --file target/app.jar --main-class com.example.App -C target/classes .
```

That is a build, and it is fine until any of these becomes true: the library
list changes, a library has libraries of its own, two of them want different
versions of a third, the project splits into modules, or somebody else has to
run it. A build tool is the answer to those five, in that order.

What Maven and Gradle both do:

1. **Resolve dependencies**, including transitive ones, from repositories.
2. **Run a lifecycle** — compile, test, package — in a fixed order, skipping
   what is already up to date.
3. **Standardise the layout** so `src/main/java` and `src/test/java` need no
   configuration.
4. **Produce the same result on another machine**, given the same
   configuration and lock.

What they disagree about is everything else, including the answer to the most
important question they both have to answer.

## Coordinates, and the conflict they cause

A dependency is `groupId:artifactId:version` — `com.google.guava:guava:33.0.0`
— and that triple is a path in a repository. Declaring it pulls in whatever
*it* depends on, and theirs, and so on. Real graphs are hundreds of nodes deep,
and the same library shows up at several versions.

Only one version can be on the classpath, because chapter 7.5 said so: the
classpath is a flat ordered search and the first `com/example/Json.class` wins.
So the build tool must **choose**, and the two tools choose differently:

```java run title="Nearest wins against highest wins"
import java.util.*;

public class Main {
    record Dep(String name, String version) {}

    static final Map<String, List<Dep>> GRAPH = Map.of(
        "app:1.0",  List.of(new Dep("web", "2.0"), new Dep("json", "1.0")),
        "web:2.0",  List.of(new Dep("json", "3.0")),
        "json:1.0", List.of(),
        "json:3.0", List.of());

    /** Maven: the declaration closest to the root wins. */
    static Map<String, String> nearestWins(String root) {
        Map<String, String> chosen = new LinkedHashMap<>();
        Map<String, Integer> depthOf = new HashMap<>();
        Deque<Object[]> queue = new ArrayDeque<>();
        Set<String> seen = new HashSet<>();
        queue.add(new Object[] { root, 0 });

        while (!queue.isEmpty()) {
            Object[] entry = queue.poll();
            String node = (String) entry[0];
            int depth = (Integer) entry[1];
            if (!seen.add(node)) {
                continue;
            }
            for (Dep dep : GRAPH.getOrDefault(node, List.of())) {
                Integer known = depthOf.get(dep.name());
                if (known == null || depth + 1 < known) {
                    depthOf.put(dep.name(), depth + 1);
                    chosen.put(dep.name(), dep.version());
                }
                queue.add(new Object[] { dep.name() + ":" + dep.version(), depth + 1 });
            }
        }
        return chosen;
    }

    /** Gradle: the highest version anyone asked for wins. */
    static Map<String, String> highestWins(String root) {
        Map<String, String> chosen = new LinkedHashMap<>();
        Deque<String> queue = new ArrayDeque<>(List.of(root));
        Set<String> seen = new HashSet<>();

        while (!queue.isEmpty()) {
            String node = queue.poll();
            if (!seen.add(node)) {
                continue;
            }
            for (Dep dep : GRAPH.getOrDefault(node, List.of())) {
                String current = chosen.get(dep.name());
                if (current == null || compareVersions(dep.version(), current) > 0) {
                    chosen.put(dep.name(), dep.version());
                }
                queue.add(dep.name() + ":" + dep.version());
            }
        }
        return chosen;
    }

    static int compareVersions(String a, String b) {
        String[] left = a.split("\\.");
        String[] right = b.split("\\.");
        for (int i = 0; i < Math.max(left.length, right.length); i++) {
            int x = i < left.length ? Integer.parseInt(left[i]) : 0;
            int y = i < right.length ? Integer.parseInt(right[i]) : 0;
            if (x != y) {
                return Integer.compare(x, y);
            }
        }
        return 0;
    }

    public static void main(String[] args) {
        System.out.println("app depends on web:2.0 and json:1.0; web:2.0 depends on json:3.0");
        System.out.println("nearest wins  (Maven):  " + nearestWins("app:1.0"));
        System.out.println("highest wins (Gradle):  " + highestWins("app:1.0"));

        System.out.println("comparing 1.10 and 1.9 numerically: " + compareVersions("1.10", "1.9"));
        System.out.println("comparing them as text:             " + "1.10".compareTo("1.9"));
    }
}
```

The same graph, two answers. Maven takes `json:1.0` because your own POM
declares it one hop from the root; Gradle takes `json:3.0` because someone
asked for it and it is higher. Neither is wrong, and this is why a project
ported from one tool to the other can fail at run time with
`NoSuchMethodError` — a class compiled against one version, running against
another.

The last two lines are the other half. `1.10` is **newer** than `1.9`, and as
text it sorts *before* it, because `'1' < '9'`. Every version comparison must
split on dots and compare numerically. Any code of yours that sorts version
strings with `compareTo` is wrong, and the bug appears on the tenth release.

## Scopes

Not every dependency belongs everywhere:

| Maven scope | Gradle configuration | On the compile classpath | Shipped |
|---|---|---|---|
| `compile` | `api` | yes, and for your consumers | yes |
| — | `implementation` | yes, but hidden from consumers | yes |
| `runtime` | `runtimeOnly` | no | yes |
| `test` | `testImplementation` | test code only | no |
| `provided` | `compileOnly` | yes | no |

`implementation` is Gradle's most useful idea and Maven has no exact
equivalent: a dependency you use internally does not leak onto your consumers'
compile classpath, so upgrading it is not a breaking change for them. Use
`api` only for types that appear in your own public signatures.

`provided`/`compileOnly` is for something the environment supplies — a servlet
API, an annotation processor's annotations. Shipping it as well gives you two
copies on the classpath and chapter 7.5's silent first-one-wins.

## The build files

```xml
<!-- pom.xml, Maven. Not compiled here. -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>app</artifactId>
  <version>1.0.0</version>

  <properties>
    <maven.compiler.release>21</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
```

```kotlin
// build.gradle.kts, Gradle. Not compiled here.
plugins {
    java
}

group = "com.example"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
}

tasks.test {
    useJUnitPlatform()
}
```

Maven is declarative: a POM describes *what* the project is, and a fixed
lifecycle decides what happens. `mvn package` runs, in order, `validate`,
`compile`, `test`, and `package` — every phase before the one you asked for.
`mvn test` therefore compiles first, and `mvn package -DskipTests` is how
people skip the part they should not.

Gradle is a task graph. Tasks declare inputs and outputs, and a task whose
inputs have not changed is reported `UP-TO-DATE` and skipped. That is why a
second `gradle build` is nearly instant and why a task with undeclared inputs
is a correctness bug — it will be skipped when it should not be.

The `toolchain` block is worth copying: it says which JDK to compile *with*,
and Gradle will download it if the machine does not have it. `--release 21`
(and Maven's `maven.compiler.release`) is the equivalent guarantee that you
cannot accidentally call an API newer than your target.

## Reproducibility

A build that produces different bytes on Tuesday is not a build, it is a
lottery. Three things break it:

- **`SNAPSHOT` versions** resolve to "the latest build of that snapshot", which
  changes under you. Fine for your own modules mid-development, never for a
  release.
- **Version ranges** (`[1.0,2.0)`) do the same thing on purpose. Maven supports
  them and almost nobody should use them.
- **Unpinned transitive versions.** You pinned your direct dependencies;
  their dependencies are whatever the resolution rules chose today. Maven's
  `<dependencyManagement>` and Gradle's version catalogues plus
  `dependencyLocking` are the fixes.

Two habits worth having from the first commit:

**Use the wrapper.** `./mvnw` and `./gradlew` are checked-in scripts that
download the exact build-tool version the project expects. Without one, "works
on my machine" includes the build tool itself.

**Look at the tree.** `mvn dependency:tree` and `gradle dependencies` print the
resolved graph with the conflicts marked. When a `NoSuchMethodError` appears at
run time, that output names the culprit in one line, and guessing does not.

:::quiz
{
  "question": "Your POM declares `json:1.0`. A library you depend on declares `json:3.0`. Maven resolves `json:1.0` and Gradle resolves `json:3.0`. Why?",
  "options": [
    { "text": "Maven picks the declaration nearest the root of the graph; Gradle picks the highest version anyone requested", "correct": true, "why": "Right — two defensible strategies for the same unavoidable choice, and the reason a port between the tools can fail at run time." },
    { "text": "Maven prefers older versions for stability; Gradle prefers newer ones", "correct": false, "why": "Maven has no preference about age — a `json:3.0` declared directly in your POM would win there too. It is depth, not version." },
    { "text": "Gradle ignores transitive dependencies unless they are declared with `api`", "correct": false, "why": "Gradle resolves the full transitive graph; `api` versus `implementation` controls what your *consumers* see, not what you resolve." },
    { "text": "Both put all versions on the classpath and the JVM picks at run time", "correct": false, "why": "The classpath is a flat ordered search, so only the first matching class is ever loaded — which is exactly why the tool must choose one." }
  ]
}
:::

## Practice

:::exercise resolve-dependencies

:::exercise read-a-jar

:::recap
- A jar is a zip with `META-INF/MANIFEST.MF`. `Main-Class` makes it executable,
  `Class-Path` lists sibling jars, and a fat jar is the dependencies copied
  inside.
- A build tool exists for the five things `javac` does not do: transitive
  resolution, a lifecycle, a standard layout, up-to-date checks, and the same
  result on someone else's machine.
- Only one version of a library can be on the classpath, so the tool chooses.
  **Maven takes the nearest declaration; Gradle takes the highest version.**
  The same graph gives different answers.
- Compare versions numerically per segment. `1.10` is newer than `1.9`, and as
  text it sorts earlier.
- `implementation`/`compileOnly` keep dependencies off your consumers' compile
  classpath and out of your artifact respectively; `api` is only for types in
  your public signatures.
- `mvn package` runs every earlier phase; a Gradle task with unchanged inputs
  is skipped as `UP-TO-DATE`, which is why undeclared inputs are a bug.
- `SNAPSHOT`s, version ranges and unpinned transitives break reproducibility.
  Use the wrapper, pin versions, and read `dependency:tree` before guessing.
