---
title: "The classpath and the module system"
navTitle: "Classpath and modules"
summary: >-
  Where classes come from, why two classes with the same name can be different types, and what the module system added on top.
objectives:
  - Describe parent delegation and the three built-in class loaders
  - Explain why class identity is name plus defining loader
  - Read a module's exports, opens and readability at run time
  - Say when the classpath is still the right answer
status: complete
standard: java21
requires: [reflection]
---

`java -cp lib/a.jar:lib/b.jar Main` says: when you need a class, search these
places in this order and take the first match. That is the **classpath**, and
it has been the same idea since 1996 — a flat, ordered list with no notion of
versions, no notion of which jar is allowed to see which, and no complaint when
two jars both contain `org/example/Util.class`. The first one wins, silently.

Everything in this chapter is either that mechanism, or an attempt to contain
it.

## Who loads what

```java run title="Three loaders and a null"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        ClassLoader application = Main.class.getClassLoader();

        System.out.println("Main is loaded by:  " + application.getClass().getSimpleName());
        System.out.println("  its parent:       " + application.getParent().getClass().getSimpleName());
        System.out.println("  its grandparent:  " + application.getParent().getParent());
        System.out.println("String is loaded by: " + String.class.getClassLoader());
        System.out.println("ArrayList by:        " + ArrayList.class.getClassLoader());
    }
}
```

Three loaders, in a chain:

- The **bootstrap** loader is written in native code and loads `java.base` —
  `String`, `Object`, `ArrayList`. It is represented as `null`, which is why
  `String.class.getClassLoader()` prints `null` rather than a name.
- The **platform** loader handles the rest of the JDK's modules.
- The **application** loader handles your classpath.

They work by **parent delegation**: asked for a class, a loader first asks its
parent, and only looks itself if the parent fails. That is a security property
as much as an organisational one. Put your own `java/lang/String.class` on the
classpath and it is never loaded, because the application loader asks the
bootstrap loader first and the bootstrap loader always has one.

## A class is a name *and* a loader

Here is the fact that explains every confusing class-loading error you will
ever see:

```java run title="Two classes, one name"
import java.io.*;

public class Main {
    public static class Widget {
        public String describe() {
            return "a widget";
        }
    }

    /** Defines one named class itself instead of delegating for it. */
    static final class Isolating extends ClassLoader {
        private final String target;
        private final byte[] bytes;

        Isolating(String target, byte[] bytes) {
            super(Main.class.getClassLoader());
            this.target = target;
            this.bytes = bytes;
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            if (!name.equals(target)) {
                return super.loadClass(name, resolve);
            }
            Class<?> found = findLoadedClass(name);
            if (found == null) {
                found = defineClass(name, bytes, 0, bytes.length);
            }
            if (resolve) {
                resolveClass(found);
            }
            return found;
        }
    }

    public static void main(String[] args) throws Exception {
        String name = Widget.class.getName();

        byte[] bytes;
        try (InputStream in = Main.class.getResourceAsStream("/" + name.replace('.', '/') + ".class")) {
            if (in == null) {
                System.out.println("could not read this program's own bytecode");
                return;
            }
            bytes = in.readAllBytes();
        }
        System.out.println("read " + bytes.length + " bytes of " + name);

        Class<?> one = new Isolating(name, bytes).loadClass(name);
        Class<?> two = new Isolating(name, bytes).loadClass(name);

        System.out.println("same name:              " + one.getName().equals(two.getName()));
        System.out.println("same Class object:      " + (one == two));
        System.out.println("same as the original:   " + (one == Widget.class));
        System.out.println("one assignable to two:  " + one.isAssignableFrom(two));

        Object instance = one.getDeclaredConstructor().newInstance();
        System.out.println("and it works:           " + one.getMethod("describe").invoke(instance));

        try {
            Widget widget = (Widget) instance;
            System.out.println("cast succeeded: " + widget);
        } catch (ClassCastException refused) {
            System.out.println("cast to Widget:         ClassCastException");
        }
    }
}
```

The same bytes, loaded by two loaders, are **two different types**. They have
the same name, the same methods and the same behaviour, and neither is
assignable to the other. The last line is the punchline: a
`ClassCastException` saying `Main$Widget cannot be cast to Main$Widget`, which
looks like a JVM bug and is the specification working exactly as written.

The rule: a class's identity is its **binary name plus its defining loader**.
Two loaders, two classes.

That is not an exotic situation. Application servers give each deployed
application its own loader so two applications can use different versions of
the same library. Plugin systems and hot-reload work the same way. When you see
`ClassCastException` between identically named types, or
`LinkageError: loader constraint violation`, the answer is always that two
loaders are involved.

It is also a leak, of the shape chapter 7.1 described: a loader holds every
class it defined, a class holds its static fields, and a class holds a
reference back to its loader. Retain one object from an undeployed application
— a `ThreadLocal` on a pooled thread will do it — and the entire application,
classes included, stays in memory.

## Modules, from the inside

Java 9 added a second layer. A **module** declares a name, what it `requires`,
what packages it `exports` for compilation and what it `opens` for reflection.
The JDK itself was carved up this way:

```java run title="Reading the module graph"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Module base = String.class.getModule();
        Module mine = Main.class.getModule();

        System.out.println("String is in module:       " + base.getName());
        System.out.println("this program is in:        " + mine + " (name " + mine.getName() + ")");
        System.out.println("modules in the boot layer: " + ModuleLayer.boot().modules().size());

        System.out.println("java.base exports java.lang:            " + base.isExported("java.lang"));
        System.out.println("java.base opens java.lang:              " + base.isOpen("java.lang"));
        System.out.println("java.base exports jdk.internal.misc:    " + base.isExported("jdk.internal.misc"));
        System.out.println("this program can read java.base:        " + mine.canRead(base));

        List<String> sample = new ArrayList<>();
        for (Module module : ModuleLayer.boot().modules()) {
            sample.add(module.getName());
        }
        Collections.sort(sample);
        System.out.println("first few: " + sample.subList(0, 6));
    }
}
```

Sixty-odd modules make up the JDK, and this program is in **none** of them: a
class on the classpath belongs to the **unnamed module**, whose `getName()` is
`null`. The unnamed module reads everything and exports everything, which is
how twenty-five years of classpath code kept working.

The three predicates are the whole model:

- `isExported("java.lang")` is `true` — you may compile against and call its
  public API.
- `isOpen("java.lang")` is `false` — you may *not* `setAccessible` into it.
  That is chapter 7.4's `InaccessibleObjectException`, stated as a property.
- `isExported("jdk.internal.misc")` is `false` — the package exists, is
  loaded, and is unreachable. Before modules there was nothing to stop you
  calling it, and libraries did, which is precisely why modules exist.

The escape hatches are command-line flags, and that is deliberate:
`--add-exports module/package=ALL-UNNAMED` for compile-time access,
`--add-opens` for reflective access. Because they live on the command line,
reaching into someone else's internals is a decision the person deploying the
application makes, not one a transitive dependency makes for them.

## Resources come from the same place

Classes and resources are found by the same search, with one rule that trips
everyone:

```java run title="Leading slash or not"
public class Main {
    public static void main(String[] args) {
        System.out.println("Class.getResource, relative to the package:");
        System.out.println("  String.class.getResource(\"String.class\")            "
            + (String.class.getResource("String.class") != null));
        System.out.println("  Main.class.getResource(\"Main.class\")                "
            + (Main.class.getResource("Main.class") != null));

        System.out.println("Class.getResource, absolute:");
        System.out.println("  String.class.getResource(\"/java/lang/String.class\") "
            + (String.class.getResource("/java/lang/String.class") != null));

        System.out.println("ClassLoader.getResource is always absolute, no slash:");
        System.out.println("  loader.getResource(\"java/lang/String.class\")        "
            + (Main.class.getClassLoader().getResource("java/lang/String.class") != null));
        System.out.println("  loader.getResource(\"/Main.class\")                   "
            + (Main.class.getClassLoader().getResource("/Main.class") != null));
    }
}
```

`Class.getResource("name")` is relative to the class's package;
`Class.getResource("/name")` is absolute. `ClassLoader.getResource` is
*always* absolute and a leading slash makes it fail — the last line prints
`false`, which is the entire bug behind a thousand "why is my config file
null" questions.

Always close what you open: `getResourceAsStream` hands you a stream, and
chapter 3.5's `try`-with-resources applies to it like anything else.

## Do you need modules?

Mostly, no, and it is worth saying plainly because the module system's
reputation suggests otherwise.

Use them when you are **publishing a library** and want its internals to be
genuinely unreachable rather than merely discouraged, or when you want `jlink`
to build a runtime image containing only the modules you use. `module-info.java`
at the root of your source tree, `requires` and `exports`, and `jdeps` to find
out what you actually depend on.

Stay on the classpath when you are building an application that runs on a JVM
you control. You get the module system's most valuable half — the JDK's own
internals being sealed — without having to modularise every dependency you
have. That is the configuration almost all Java code runs in today, including
every program in this book.

What you cannot avoid is the *consequence* of modules: `setAccessible` into
the JDK stopped working, and a library that used to do it now needs a flag. If
you meet `InaccessibleObjectException` while upgrading a JVM, that is what
happened, and `--add-opens` is the answer while you find a library that does
not need it.

:::quiz
{
  "question": "The same class file is loaded by two different class loaders. Casting an instance from one to the type from the other throws `ClassCastException: Main$Widget cannot be cast to Main$Widget`. Why?",
  "options": [
    { "text": "Class identity is the binary name plus the defining loader, so these are two distinct types that happen to share a name", "correct": true, "why": "Right. The message looks like a bug because it prints only the name, which is the half the two types have in common." },
    { "text": "The two loaders read the file at different times and one version is stale", "correct": false, "why": "The bytes are identical in the demonstration; the file is read once. Identity does not depend on content." },
    { "text": "One of the loaders failed to run the static initialiser, leaving the class incomplete", "correct": false, "why": "Both classes are fully initialised — the instance from one of them is constructed and its method called successfully." },
    { "text": "Casting between classes always requires the same package, and the loaders put them in different packages", "correct": false, "why": "Both classes report the same package and the same binary name; it is the loader that differs." }
  ]
}
:::

## Practice

:::exercise resource-lookup

:::exercise isolating-loader

:::recap
- The classpath is an ordered search path with no versioning; when two jars
  contain the same class, the first one silently wins.
- Bootstrap (`null`), platform and application loaders form a chain, and
  **parent delegation** means a loader asks its parent before looking itself.
- A class's identity is its binary name **plus its defining loader**. Two
  loaders give two incompatible types with the same name — the cause of every
  `ClassCastException` between identically named classes.
- A retained class loader retains every class it defined; this is how an
  undeployed application leaks its entire heap.
- A module declares `requires`, `exports` (compile and call) and `opens`
  (reflect). `java.base` exports `java.lang` and does not open it.
- Classpath code is in the **unnamed module**, which reads and exports
  everything — which is why old code still runs.
- `Class.getResource` is package-relative unless it starts with `/`;
  `ClassLoader.getResource` is always absolute and must *not* start with `/`.
- Modules are for publishing libraries and building `jlink` images. For an
  application on a JVM you control, the classpath is still the right answer.
