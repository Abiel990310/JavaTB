---
title: "Packaging and shipping"
navTitle: "Packaging"
summary: >-
  Turning a directory of class files into something someone else can run — and knowing, afterwards, exactly what you gave them.
objectives:
  - Choose between a fat jar, a runtime image and an installer
  - Discover plugins the way ServiceLoader does
  - Layer configuration so the right source wins
  - Build reproducibly and shut down cleanly
status: complete
standard: java21
requires: [api-design]
---

Shipping is the point at which your code stops being yours. It runs on a
machine you do not control, configured by someone who has not read it, and when
it misbehaves the only evidence is what you thought to include.

Chapter 9.2 covered what a jar *is*. This chapter is about what to put in one,
what to put around it, and what to build in so the next person can tell what
they are running.

## Four ways to hand it over

| Form | What the user needs | Size | Good for |
|---|---|---|---|
| **Thin jar + `Class-Path`** | a JVM, and the dependency jars beside it | small | internal tools with a managed layout |
| **Fat jar** (shade / shadow) | a JVM | tens of MB | almost everything |
| **`jlink` runtime image** | nothing | 40–100 MB | containers, no-JVM environments |
| **`jpackage` installer** | nothing | 100 MB+ | desktop applications |

A **fat jar** is the default answer, and its one real hazard is entry
collisions: two dependencies both shipping
`META-INF/services/javax.script.ScriptEngineFactory` cannot both survive, and a
naive merge keeps one. Maven's shade plugin and Gradle's shadow plugin both
have transformers for exactly this; if service loading stops working after you
build a fat jar, that is why.

**`jlink`** builds a JVM containing only the modules you use — which is why
chapter 7.5's module system matters even to applications that stay on the
classpath: `jdeps` will tell you which modules your dependencies need, and
`jlink --add-modules` builds the image. **`jpackage`** wraps that image in a
platform installer.

There is a fifth form worth naming: a **container image** with a JRE base
layer and your fat jar copied in. It is the same fat jar with the JVM version
pinned alongside it, which solves the one thing the fat jar does not.

## Discovering what was shipped alongside you

A plugin mechanism means finding implementations you were not compiled
against. The standard one is a text file listing class names, and it is worth
building once to see that there is nothing else to it:

```java run title="Service discovery, by hand"
import java.util.*;

public class Main {
    public interface Greeter {
        String greet(String name);
    }

    public static final class Formal implements Greeter {
        @Override
        public String greet(String name) {
            return "Good day, " + name;
        }
    }

    public static final class Casual implements Greeter {
        @Override
        public String greet(String name) {
            return "hi " + name;
        }
    }

    /** What ServiceLoader does: read the names, load them, instantiate them. */
    static <T> List<T> load(Class<T> service, List<String> providerNames, ClassLoader loader) {
        List<T> providers = new ArrayList<>();
        for (String name : providerNames) {
            if (name.isBlank() || name.startsWith("#")) {
                continue;
            }
            try {
                Class<?> type = Class.forName(name.trim(), false, loader);
                providers.add(service.cast(type.getDeclaredConstructor().newInstance()));
            } catch (ReflectiveOperationException failure) {
                throw new ServiceConfigurationError(
                    service.getName() + ": provider " + name + " could not be instantiated", failure);
            } catch (ClassCastException failure) {
                throw new ServiceConfigurationError(
                    service.getName() + ": provider " + name + " does not implement it", failure);
            }
        }
        return List.copyOf(providers);
    }

    public static void main(String[] args) {
        // In a real deployment this list is the lines of
        // META-INF/services/<interface name>, contributed by each jar.
        List<String> declared = List.of(
            "# providers for Greeter",
            Formal.class.getName(),
            "",
            Casual.class.getName());

        for (Greeter greeter : load(Greeter.class, declared, Main.class.getClassLoader())) {
            System.out.println("  " + greeter.greet("Ada"));
        }

        try {
            load(Greeter.class, List.of("com.example.NotThere"), Main.class.getClassLoader());
        } catch (ServiceConfigurationError expected) {
            System.out.println("missing provider: " + expected.getMessage());
        }

        try {
            load(Greeter.class, List.of("java.lang.String"), Main.class.getClassLoader());
        } catch (ServiceConfigurationError expected) {
            System.out.println("wrong type:       " + expected.getMessage());
        }

        System.out.println("real ServiceLoader finds "
            + ServiceLoader.load(Greeter.class).stream().count()
            + " (no META-INF/services file on this classpath)");
    }
}
```

The real thing is `ServiceLoader.load(Greeter.class)`, and the only difference
is where the list comes from:

```java
// The file a provider jar ships. Not compiled — it is a resource.
// META-INF/services/com.example.Greeter
com.example.impl.FormalGreeter
com.example.impl.CasualGreeter
```

Three things follow from the mechanism. A provider needs a **public
no-argument constructor**, which is why so many frameworks demand one
(chapter 7.4). Discovery is **lazy** — `ServiceLoader` is an `Iterable` and
instantiates as you iterate, so a broken provider fails when you reach it, not
at load. And a provider that cannot be constructed throws
`ServiceConfigurationError`, an `Error` rather than an `Exception`, because
there is nothing sensible to do about a misconfigured deployment.

This is how JDBC drivers, SLF4J bindings, `Charset` providers and JPMS
services all work.

## Configuration, in layers

```java run title="The right source wins"
import java.util.*;

public class Main {
    record Settings(String host, int port, boolean verbose) {}

    /** Later sources override earlier ones. */
    static String resolve(String key, List<Map<String, String>> sources, String fallback) {
        String value = fallback;
        for (Map<String, String> source : sources) {
            String candidate = source.get(key);
            if (candidate != null && !candidate.isBlank()) {
                value = candidate;
            }
        }
        return value;
    }

    static Settings settingsFrom(Map<String, String> file,
                                 Map<String, String> environment,
                                 Map<String, String> systemProperties) {
        List<Map<String, String>> sources = List.of(file, environment, systemProperties);
        return new Settings(
            resolve("app.host", sources, "localhost"),
            Integer.parseInt(resolve("app.port", sources, "8080")),
            Boolean.parseBoolean(resolve("app.verbose", sources, "false")));
    }

    public static void main(String[] args) {
        Map<String, String> nothing = Map.of();

        System.out.println("defaults only:      " + settingsFrom(nothing, nothing, nothing));
        System.out.println("file only:          "
            + settingsFrom(Map.of("app.host", "from-file", "app.port", "9000"), nothing, nothing));
        System.out.println("env beats file:     "
            + settingsFrom(Map.of("app.host", "from-file"), Map.of("app.host", "from-env"), nothing));
        System.out.println("property beats env: "
            + settingsFrom(Map.of("app.host", "from-file"),
                Map.of("app.host", "from-env"),
                Map.of("app.host", "from-property")));
        System.out.println("blank does not win: "
            + settingsFrom(Map.of("app.host", "from-file"), Map.of("app.host", "  "), nothing));

        System.out.println();
        System.out.println("this JVM's java.version: " + System.getProperty("java.version"));
        System.out.println("Runtime.version().feature(): " + Runtime.version().feature());
        System.out.println("PATH is set in the environment: " + (System.getenv("PATH") != null));
        System.out.println("an unset variable reads as: " + System.getenv("APP_DEFINITELY_NOT_SET"));
    }
}
```

The order that has become standard, weakest first: **built-in defaults, a
configuration file, environment variables, system properties, command-line
arguments.** Each layer is easier to change than the one before it, and the
easiest to change wins.

Two details that are worth getting right the first time. A **blank** value
should not override — an empty environment variable is almost always an unset
one that a shell script expanded anyway, and treating it as a deliberate empty
string produces a service that binds to no host and reports no error. And
`System.getenv` returns `null` for anything unset, so every read needs a
default; the resolver above is the place to put that, not each call site.

Secrets belong in the environment or a secrets manager, never in a file inside
the jar and never in a system property — `-Dapp.password=...` is visible in
`ps` output to every user on the machine.

## Knowing what you shipped

```java run title="Where the version comes from"
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.jar.*;

public class Main {
    public static void main(String[] args) throws IOException {
        Manifest manifest = new Manifest();
        Attributes attributes = manifest.getMainAttributes();
        attributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
        attributes.put(Attributes.Name.MAIN_CLASS, "com.example.App");
        attributes.put(new Attributes.Name("Implementation-Title"), "example-app");
        attributes.put(new Attributes.Name("Implementation-Version"), "1.4.2");
        attributes.put(new Attributes.Name("Build-Revision"), "9f3c1ab");
        attributes.put(new Attributes.Name("Build-Jdk"), Runtime.version().toString());

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (JarOutputStream jar = new JarOutputStream(bytes, manifest)) {
            jar.putNextEntry(new JarEntry("com/example/App.class"));
            jar.write("(bytecode)".getBytes(StandardCharsets.UTF_8));
            jar.closeEntry();
        }

        try (JarInputStream in = new JarInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            Attributes read = in.getManifest().getMainAttributes();
            for (String key : List.of("Implementation-Title", "Implementation-Version",
                                      "Build-Revision", "Build-Jdk")) {
                System.out.println(key + ": " + read.getValue(key));
            }
        }

        System.out.println();
        System.out.println("running from a jar? Package version is "
            + Main.class.getPackage().getImplementationVersion());
        System.out.println("running on: " + Runtime.version());
    }
}
```

`Package.getImplementationVersion()` reads `Implementation-Version` out of the
manifest of the jar the class came from — and returns `null` when the class
came from a plain directory, as the last line shows. That is the one-line
answer to "what version is running", and it costs one line of build
configuration to enable.

Add `Build-Revision` too. The version tells you which release; the commit
tells you exactly which build, which is what you actually need when the release
was cut three times.

## Reproducible builds

```java run title="Two builds, one file?"
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.jar.*;

public class Main {
    static byte[] build(boolean fixedTimestamps) throws IOException {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (JarOutputStream jar = new JarOutputStream(bytes, manifest)) {
            for (String name : List.of("a.txt", "b.txt")) {
                JarEntry entry = new JarEntry(name);
                if (fixedTimestamps) {
                    entry.setTime(0);
                }
                jar.putNextEntry(entry);
                jar.write(("content of " + name).getBytes(StandardCharsets.UTF_8));
                jar.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        byte[] first = build(false);
        Thread.sleep(2_100);                 // zip timestamps resolve to two seconds
        byte[] second = build(false);
        System.out.println("default timestamps -> identical bytes: " + Arrays.equals(first, second));

        byte[] third = build(true);
        byte[] fourth = build(true);
        System.out.println("fixed timestamps   -> identical bytes: " + Arrays.equals(third, fourth));
    }
}
```

The same inputs produce a **different jar** two seconds later, because every
entry carries a modification time. That matters more than it sounds: a build
whose output is not byte-identical cannot be verified by anyone, cannot be
cached usefully, and cannot answer "is the jar in production the one we built
from this commit".

The fixes are the same everywhere: **fix the entry timestamps**, **sort the
entries**, and do not embed a build date. Maven honours the
`project.build.outputTimestamp` property; Gradle has
`preserveFileTimestamps = false` and `reproducibleFileOrder = true` on its
archive tasks. Two lines, and the question becomes answerable.

## Shutting down

```java run title="Hooks, and what skips them"
public class Main {
    public static void main(String[] args) {
        Runtime.getRuntime().addShutdownHook(new Thread(() ->
            System.out.println("  hook: flushing the write buffer")));
        Runtime.getRuntime().addShutdownHook(new Thread(() ->
            System.out.println("  hook: closing the connection pool")));

        System.out.println("doing the work");
        System.out.println("main is returning; hooks run after this");
    }
}
```

A shutdown hook is an unstarted `Thread` that the JVM starts when it is going
down — on a normal exit, on `System.exit`, and on `SIGTERM`, which is what a
container runtime and `kill` both send. That makes it the right place to flush
buffers, close pools and deregister from a service registry.

Four things to know:

- **Hooks run concurrently and in no particular order.** The output above
  happens to be in registration order and nothing promises it. If one must
  happen before another, sequence them inside a single hook.
- **They are not guaranteed to run at all.** `Runtime.halt`, a `SIGKILL`, and
  the operating system running out of memory all skip them. A hook is a
  courtesy, not a durability mechanism — anything that must survive has to be
  written before the process is asked to stop.
- **Keep them short.** A container runtime typically sends `SIGTERM`, waits
  ten to thirty seconds, then sends `SIGKILL`. A hook that takes a minute is a
  hook that gets killed halfway.
- **Do not call `System.exit` from a hook.** It deadlocks: shutdown is already
  in progress and the call waits for it to finish.

## A shipping checklist

- One artifact, produced by the build, with the version and the commit in the
  manifest.
- Configuration layered, with defaults that work and no secrets in the
  artifact.
- Logs to standard output, structured if anything will read them
  automatically, with the exception object and not just its message
  (chapter 9.3).
- A shutdown hook that flushes and closes, and finishes inside ten seconds.
- The JVM version pinned somewhere the deployment respects — a container base
  image, a `jlink` image, or a toolchain declaration.
- A reproducible build, so the artifact can be traced to the commit.
- Something that answers "what is running" without a deploy: a version
  endpoint, a startup log line, or both.

:::quiz
{
  "question": "Your service works from an IDE and, after being packaged as a fat jar, silently finds no JDBC driver. What is the most likely cause?",
  "options": [
    { "text": "Two dependencies contributed the same `META-INF/services/...` entry and the shade step kept only one", "correct": true, "why": "Right — service files must be *merged*, not overwritten, which is why the shade and shadow plugins ship transformers for exactly this." },
    { "text": "The driver class was not listed in `Main-Class`", "correct": false, "why": "`Main-Class` names the entry point; drivers are found through service loading, not through the manifest's main class." },
    { "text": "Fat jars cannot contain resources, only classes", "correct": false, "why": "A jar is a zip and holds any file; chapter 9.2 built one containing a properties file." },
    { "text": "`ServiceLoader` only works with the module path", "correct": false, "why": "It works with both — `META-INF/services` on the classpath is the older mechanism and still the common one." }
  ]
}
:::

## Practice

:::exercise layered-config

:::exercise plugin-registry

:::recap
- Fat jar by default; `jlink` when the target has no JVM; `jpackage` for
  desktop installers; a container image when the JVM version must ship too.
- Fat jars must **merge** `META-INF/services` entries, not overwrite them.
- Service loading is a text file of class names, a public no-argument
  constructor, and lazy instantiation. A bad provider throws
  `ServiceConfigurationError`.
- Layer configuration weakest-first — defaults, file, environment, system
  properties, arguments — and do not let a blank value override.
  Secrets go in the environment, never in a system property.
- Put `Implementation-Version` and the commit in the manifest;
  `Package.getImplementationVersion()` reads it back, and returns `null`
  outside a jar.
- The same inputs produce a different jar seconds later unless you fix entry
  timestamps and order. Both build tools have a switch for it.
- Shutdown hooks run concurrently, in no order, and not at all on `halt` or
  `SIGKILL`. Keep them under the runtime's grace period and never call
  `System.exit` from one.
