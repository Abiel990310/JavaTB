---
id: isolating-loader
title: "Two loaders, two types"
difficulty: stretch
chapter: classpath-and-modules
topics: [class-loaders, delegation, reflection]
check: unit
standard: java21
---

Build the class loader from the chapter properly, and then prove the two
things about it that matter: what it isolates, and what it does not.

- `static byte[] bytecodeOf(Class<?> type)` — the class's own bytes, read
  through its loader as a resource; throws `IllegalStateException` naming the
  class when they cannot be found
- `static final class Sandbox extends ClassLoader` — constructed with a set of
  binary names it should define **itself**, plus the bytes for each. For any
  other name it delegates to its parent as usual. Loading the same name twice
  through one `Sandbox` returns the same `Class`.
- `Class<?> load(String name)` on `Sandbox`, wrapping
  `ClassNotFoundException` in `IllegalStateException`
- `static boolean sameType(Class<?> a, Class<?> b)` — true when the two are
  mutually assignable
- `static String callDescribe(Class<?> type)` — construct an instance through
  its no-argument constructor and return `describe()` reflectively

`Widget` and `Gadget` are given. `Gadget` calls into `Widget`, which is the
interesting case: a sandbox that isolates `Gadget` but not `Widget` produces a
`Gadget` that still shares the outer `Widget`.

## Starter
```java
import java.io.*;

public static class Widget {
    public String describe() {
        return "widget";
    }
}

public static class Gadget {
    public String describe() {
        return "gadget holding a " + new Widget().describe();
    }
}

static byte[] bytecodeOf(Class<?> type) {
    return new byte[0];
}

static final class Sandbox extends ClassLoader {
    Sandbox(Map<String, byte[]> own) {
        super(Main.class.getClassLoader());
    }

    Class<?> load(String name) {
        return null;
    }
}

static boolean sameType(Class<?> a, Class<?> b) {
    return a.getName().equals(b.getName());
}

static String callDescribe(Class<?> type) {
    return "";
}
```

## Tests
```java
byte[] widgetBytes = bytecodeOf(Widget.class);
byte[] gadgetBytes = bytecodeOf(Gadget.class);
check(widgetBytes.length > 50);
check(gadgetBytes.length > 50);
checkEq(widgetBytes[0] & 0xFF, 0xCA);
checkEq(widgetBytes[1] & 0xFF, 0xFE);

checkThrows(IllegalStateException.class, () -> bytecodeOf(int.class));

String widgetName = Widget.class.getName();
String gadgetName = Gadget.class.getName();

Sandbox first = new Sandbox(Map.of(widgetName, widgetBytes));
Sandbox second = new Sandbox(Map.of(widgetName, widgetBytes));

Class<?> a = first.load(widgetName);
Class<?> b = second.load(widgetName);

// Same name, same bytes, different types.
checkEq(a.getName(), b.getName());
check(a != b);
check(a != Widget.class);
check(!sameType(a, b));
check(!sameType(a, Widget.class));
check(sameType(a, a));
check(sameType(Widget.class, Widget.class));

// One sandbox is consistent with itself.
check(first.load(widgetName) == a);

// The isolated copy still works.
checkEq(callDescribe(a), "widget");
checkEq(callDescribe(Widget.class), "widget");

// Delegation: a name the sandbox does not own comes from the parent unchanged.
check(first.load("java.lang.String") == String.class);
check(first.load(gadgetName) == Gadget.class);

// A sandbox that owns Gadget but not Widget shares the outer Widget.
Sandbox gadgetOnly = new Sandbox(Map.of(gadgetName, gadgetBytes));
Class<?> isolatedGadget = gadgetOnly.load(gadgetName);
check(isolatedGadget != Gadget.class);
checkEq(callDescribe(isolatedGadget), "gadget holding a widget");
check(gadgetOnly.load(widgetName) == Widget.class);

// Owning both isolates the pair together.
Sandbox both = new Sandbox(Map.of(widgetName, widgetBytes, gadgetName, gadgetBytes));
Class<?> pairedGadget = both.load(gadgetName);
Class<?> pairedWidget = both.load(widgetName);
check(pairedGadget != Gadget.class);
check(pairedWidget != Widget.class);
checkEq(callDescribe(pairedGadget), "gadget holding a widget");

checkThrows(IllegalStateException.class, () -> first.load("com.example.NotThere"));
```

## Hints
- `bytecodeOf`: the resource name is the binary name with dots replaced by
  slashes, plus `.class`, asked for absolutely. `int.class` has no bytecode,
  which is the failing case.
- `Sandbox` must override `loadClass(String, boolean)`, not `findClass` — you
  need to intercept *before* delegation, which is exactly what parent-first
  delegation normally prevents.
- `findLoadedClass(name)` is how you avoid defining the same class twice; a
  second `defineClass` for one name in one loader throws `LinkageError`.
- `defineClass(name, bytes, 0, bytes.length)` is `protected`, which is why
  `Sandbox` has to be a subclass rather than a helper.
- `sameType` is `a.isAssignableFrom(b) && b.isAssignableFrom(a)`. Names are
  not enough — that is the whole point of the exercise.
- `callDescribe` needs `getDeclaredConstructor().newInstance()` and
  `getMethod("describe").invoke(instance)`; return the result as a `String`.
  Do not cast the instance to `Widget` — you cannot.

## Solution
```java
import java.io.*;

public static class Widget {
    public String describe() {
        return "widget";
    }
}

public static class Gadget {
    public String describe() {
        return "gadget holding a " + new Widget().describe();
    }
}

static byte[] bytecodeOf(Class<?> type) {
    String path = "/" + type.getName().replace('.', '/') + ".class";
    ClassLoader loader = type.getClassLoader();
    try (InputStream in = loader != null
            ? loader.getResourceAsStream(path.substring(1))
            : Main.class.getResourceAsStream(path)) {
        if (in == null) {
            throw new IllegalStateException("no bytecode for " + type.getName());
        }
        return in.readAllBytes();
    } catch (IOException failure) {
        throw new IllegalStateException("reading " + type.getName(), failure);
    }
}

static final class Sandbox extends ClassLoader {
    private final Map<String, byte[]> own;

    Sandbox(Map<String, byte[]> own) {
        super(Main.class.getClassLoader());
        this.own = Map.copyOf(own);
    }

    @Override
    protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
        byte[] bytes = own.get(name);
        if (bytes == null) {
            return super.loadClass(name, resolve);
        }
        Class<?> already = findLoadedClass(name);
        Class<?> defined = already != null ? already : defineClass(name, bytes, 0, bytes.length);
        if (resolve) {
            resolveClass(defined);
        }
        return defined;
    }

    Class<?> load(String name) {
        try {
            return loadClass(name);
        } catch (ClassNotFoundException missing) {
            throw new IllegalStateException("cannot load " + name, missing);
        }
    }
}

static boolean sameType(Class<?> a, Class<?> b) {
    return a.isAssignableFrom(b) && b.isAssignableFrom(a);
}

static String callDescribe(Class<?> type) {
    try {
        Object instance = type.getDeclaredConstructor().newInstance();
        return (String) type.getMethod("describe").invoke(instance);
    } catch (java.lang.reflect.InvocationTargetException wrapped) {
        throw new IllegalStateException("describe() threw", wrapped.getCause());
    } catch (ReflectiveOperationException failure) {
        throw new IllegalStateException("calling describe on " + type.getName(), failure);
    }
}
```

## Notes
The override has to be `loadClass`, and that is the whole difficulty. The
documented way to write a class loader is to override `findClass`, which
`loadClass` calls **after** asking the parent — so a `findClass` override never
runs for a class the parent can already supply, and here the parent can supply
every one of them. Intercepting before delegation is deliberately awkward,
because a loader that shadows arbitrary names is how you break the JDK. Doing
it for a named set, as `Sandbox` does, is the shape a plugin container uses.

`findLoadedClass` before `defineClass` is not an optimisation. Defining the
same name twice in one loader throws `LinkageError: attempted duplicate class
definition`, so without the check `first.load(widgetName) == a` would not
merely be false — the second call would fail outright.

The `Gadget` cases are the interesting half. `Gadget.describe()` contains
`new Widget()`, and which `Widget` that resolves to is decided at *link* time
by the loader that defined `Gadget`. A sandbox owning only `Gadget` delegates
`Widget` to the parent, so the isolated `Gadget` uses the ordinary `Widget` —
its behaviour is identical and only its own identity changed. A sandbox owning
both gives a `Gadget` whose `Widget` is also isolated. This is precisely how an
application server gives two deployments different versions of a library while
they continue to share the JDK: what a class sees is what *its* loader can
reach.

`sameType` deliberately does not compare names. `a.getName().equals(b.getName())`
is true for every pair in these tests and tells you nothing — it is the
comparison a debugger prints and the reason
`ClassCastException: Main$Widget cannot be cast to Main$Widget` reads as
nonsense. Mutual assignability is the real question.

Finally, note what `callDescribe` cannot do: cast the instance to `Widget`.
There is no way to write a compile-time reference to a type that did not exist
when you compiled. Everything crossing a loader boundary travels either
reflectively or through an interface that *both* loaders share — which in
practice means an interface loaded by the common parent. That constraint is why
plugin APIs are always interfaces in a separate, shared jar.
