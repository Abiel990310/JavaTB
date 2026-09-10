---
title: "Reflection and annotations"
navTitle: "Reflection"
summary: >-
  The class file is still there at run time, and you can read it. That is how every test runner, injector and serialiser you use works — and it costs about twenty-five times a direct call.
objectives:
  - Inspect a class's members and read runtime annotations
  - Write a small annotation-driven runner
  - Say what setAccessible can and cannot open, and why
  - Measure reflection's cost and know when it is worth paying
status: complete
standard: java21
requires: [class-loading]
---

A `.class` file keeps far more than the instructions. Field names, method
signatures, generic type arguments, annotations, record components — all of it
survives compilation, and the JVM hands it back through `java.lang.reflect`.

That is not a curiosity. It is the mechanism underneath JUnit, Spring,
Jackson, Hibernate and every other framework that appears to know things about
your code that you never told it.

## Reading a class

```java run title="What is in there"
import java.lang.reflect.*;
import java.util.*;

public class Main {
    static class Account {
        public final String id;
        private double balance;

        Account(String id, double balance) {
            this.id = id;
            this.balance = balance;
        }

        public double balance() {
            return balance;
        }

        private void adjust(double amount) {
            balance += amount;
        }
    }

    public static void main(String[] args) {
        System.out.println("declared fields:");
        for (Field field : sortedByName(Account.class.getDeclaredFields())) {
            System.out.println("  " + Modifier.toString(field.getModifiers())
                + " " + field.getType().getSimpleName() + " " + field.getName());
        }

        System.out.println("declared methods:");
        for (Method method : sortedByName(Account.class.getDeclaredMethods())) {
            System.out.println("  " + method.getName() + " returns "
                + method.getReturnType().getSimpleName());
        }

        System.out.println("public members, including inherited:");
        for (Method method : sortedByName(Account.class.getMethods())) {
            System.out.println("  " + method.getName());
        }
    }

    static <T extends Member> T[] sortedByName(T[] members) {
        Arrays.sort(members, Comparator.comparing(Member::getName));
        return members;
    }
}
```

`getDeclaredX` returns everything this class declares, whatever its access.
`getX` returns only public members, including inherited ones — so
`getMethods()` includes `equals`, `hashCode`, `toString` and the rest of
`Object`.

The sorting is not decoration. **The order of the arrays these methods return
is unspecified**, and it varies between JVM versions and even between runs. Any
code that depends on declaration order is broken; sort by something you chose.

## Annotations that survive

An annotation is only visible at run time if it says so:

```java run title="Retention decides"
import java.lang.annotation.*;
import java.util.*;

public class Main {
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Checked {
        String name();
        boolean slow() default false;
    }

    @Retention(RetentionPolicy.SOURCE)
    @interface Note {
    }

    static class Suite {
        @Checked(name = "addition")
        void addsUp() {
        }

        @Checked(name = "the long one", slow = true)
        void takesAWhile() {
        }

        @Note
        void annotatedButInvisible() {
        }
    }

    public static void main(String[] args) throws Exception {
        for (String name : List.of("addsUp", "takesAWhile", "annotatedButInvisible")) {
            Checked checked = Suite.class.getDeclaredMethod(name).getAnnotation(Checked.class);
            System.out.println(name + " -> "
                + (checked == null ? "no @Checked" : checked.name() + ", slow=" + checked.slow()));
        }

        System.out.println("all annotations on annotatedButInvisible: "
            + Arrays.toString(Suite.class.getDeclaredMethod("annotatedButInvisible").getAnnotations()));
    }
}
```

`RetentionPolicy.SOURCE` means `javac` discards it — `@Override` and
`@SuppressWarnings` are like this, and the last line prints an empty array.
`CLASS` (the default) keeps it in the file but not in memory. Only `RUNTIME`
is readable through reflection, and forgetting `@Retention(RUNTIME)` on an
annotation your own framework is supposed to find is the most common way to
spend an afternoon.

`@Target` says where it may be written, and the compiler enforces it. The
annotation's members look like methods and are read like methods, which is why
`checked.name()` rather than `checked.name`.

## Twelve lines of test framework

Put the two together and you have the shape of every annotation-driven tool:

```java run title="A test runner"
import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Test {
    }

    static class MathTests {
        @Test
        void additionWorks() {
            if (1 + 1 != 2) throw new AssertionError("arithmetic is broken");
        }

        @Test
        void thisOneFails() {
            throw new AssertionError("expected 3 but was 4");
        }

        void helper() {
            throw new AssertionError("never called");
        }
    }

    public static void main(String[] args) throws Exception {
        Object suite = MathTests.class.getDeclaredConstructor().newInstance();

        Method[] methods = MathTests.class.getDeclaredMethods();
        Arrays.sort(methods, Comparator.comparing(Method::getName));

        int passed = 0;
        int failed = 0;
        for (Method method : methods) {
            if (!method.isAnnotationPresent(Test.class)) {
                continue;
            }
            method.setAccessible(true);
            try {
                method.invoke(suite);
                System.out.println("PASS  " + method.getName());
                passed++;
            } catch (InvocationTargetException wrapped) {
                System.out.println("FAIL  " + method.getName()
                    + ": " + wrapped.getCause().getMessage());
                failed++;
            }
        }
        System.out.println(passed + " passed, " + failed + " failed");
    }
}
```

Three details in there matter more than the rest.

`getDeclaredConstructor().newInstance()` is how a framework builds an object
whose class it has never seen. It needs a no-argument constructor, which is why
so many frameworks demand one.

`setAccessible(true)` is why the test methods can be package-private — or
private. Without it, `invoke` on a non-public method throws
`IllegalAccessException`.

`InvocationTargetException` is the important one. Anything the invoked method
throws comes back wrapped, so the catch that means "the test failed" is a catch
of `InvocationTargetException`, and the real failure is `getCause()`. Catching
`AssertionError` directly would never fire.

## What `setAccessible` cannot open

```java run title="The module boundary"
import java.lang.reflect.*;

public class Main {
    static class Mine {
        private int secret = 42;
    }

    public static void main(String[] args) throws Exception {
        Field mine = Mine.class.getDeclaredField("secret");
        mine.setAccessible(true);
        System.out.println("my own private field: " + mine.get(new Mine()));

        try {
            Field value = String.class.getDeclaredField("value");
            value.setAccessible(true);
            System.out.println("opened String.value");
        } catch (Throwable refused) {
            System.out.println("String.value: " + refused.getClass().getSimpleName());
        }
    }
}
```

Your own private fields open without argument. `String.value` does not:
`java.base` does not export its internals to anyone, so `setAccessible` throws
`InaccessibleObjectException`. Since Java 16 this is enforced by default, and
`--add-opens java.base/java.lang=ALL-UNNAMED` is the escape hatch — a flag,
deliberately, so that a library reaching into the JDK is a decision someone
made at deployment rather than one a dependency made for you.

The lesson for your own code is the mirror image: `private` is a real boundary
against accident, and not a boundary against a determined caller in the same
module. Design accordingly.

## Generics did survive — in the signature

Chapter 5.2 said the type argument is erased. That is true of the *type*, and
false of the *declaration*:

```java run title="Two answers about the same field"
import java.lang.reflect.*;
import java.util.*;

public class Main {
    static class Holder {
        List<String> names = new ArrayList<>();
        Map<String, List<Integer>> index = new HashMap<>();
    }

    record Point(int x, int y) {
    }

    public static void main(String[] args) throws Exception {
        for (String name : List.of("names", "index")) {
            Field field = Holder.class.getDeclaredField(name);
            System.out.println(name);
            System.out.println("  erased type:   " + field.getType().getSimpleName());
            System.out.println("  declared type: " + field.getGenericType());
        }

        System.out.println("record components:");
        for (RecordComponent component : Point.class.getRecordComponents()) {
            System.out.println("  " + component.getType().getSimpleName()
                + " " + component.getName());
        }
    }
}
```

`getType()` gives `List` — what the JVM knows. `getGenericType()` gives
`java.util.List<java.lang.String>`, read out of a `Signature` attribute that
`javac` writes alongside the erased descriptor. This is how Jackson knows to
build `List<String>` rather than `List<Object>` from JSON: the type argument is
gone from the *field*, and preserved in the *class file*.

The same applies to `getRecordComponents()`, which returns names, types and
generic types in declaration order — the one reflective array whose order *is*
specified, because a record's components are ordered by definition.

## What it costs

```java run title="Measured: ten million calls, four ways"
import java.lang.invoke.*;
import java.lang.reflect.*;

public class Main {
    static int twice(int n) {
        return n * 2;
    }

    public static void main(String[] args) throws Throwable {
        int n = 10_000_000;

        Method plain = Main.class.getDeclaredMethod("twice", int.class);
        Method opened = Main.class.getDeclaredMethod("twice", int.class);
        opened.setAccessible(true);
        MethodHandle handle = MethodHandles.lookup()
            .findStatic(Main.class, "twice", MethodType.methodType(int.class, int.class));

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long direct = 0;
            for (int i = 0; i < n; i++) {
                direct += twice(i);
            }
            long directMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long reflected = 0;
            for (int i = 0; i < n; i++) {
                reflected += (int) plain.invoke(null, i);
            }
            long reflectMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long openedTotal = 0;
            for (int i = 0; i < n; i++) {
                openedTotal += (int) opened.invoke(null, i);
            }
            long openedMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long viaHandle = 0;
            for (int i = 0; i < n; i++) {
                viaHandle += (int) handle.invokeExact(i);
            }
            long handleMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  direct " + directMs + " ms"
                + "   Method.invoke " + reflectMs + " ms"
                + "   setAccessible " + openedMs + " ms"
                + "   MethodHandle " + handleMs + " ms"
                + "   agree: " + (direct == reflected && reflected == openedTotal
                    && openedTotal == viaHandle));
        }
    }
}
```

Warm: **direct 3 ms, `Method.invoke` 85 ms, with `setAccessible` 74 ms,
`MethodHandle.invokeExact` 20 ms.** Reflection is roughly twenty-five times a
direct call here, and a good part of that is not the dispatch — `invoke` takes
`Object...`, so every `int` argument is boxed and an array is allocated per
call. `setAccessible(true)` helps a little by skipping the access check.
`MethodHandle` is much closer, because the signature is known and the JIT has
something to work with.

Looking the member up is its own cost, and it is the one people leave in a
loop:

```java run title="Measured: cache the Method"
import java.lang.reflect.*;

public class Main {
    static int twice(int n) {
        return n * 2;
    }

    public static void main(String[] args) throws Exception {
        int n = 2_000_000;
        Method cached = Main.class.getDeclaredMethod("twice", int.class);

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long a = 0;
            for (int i = 0; i < n; i++) {
                a += (int) cached.invoke(null, i);
            }
            long cachedMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long b = 0;
            for (int i = 0; i < n; i++) {
                Method fresh = Main.class.getDeclaredMethod("twice", int.class);
                b += (int) fresh.invoke(null, i);
            }
            long lookupMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  cached " + cachedMs + " ms"
                + "   looked up every call " + lookupMs + " ms"
                + "   agree: " + (a == b));
        }
    }
}
```

14 ms against 72 ms — five times, for repeating a lookup whose answer never
changes. `getDeclaredMethod` searches and then *copies* the `Method` object, so
it is not free even when cached internally. Frameworks look everything up once,
at startup, and keep it.

## When to reach for it

Reflection is the right tool when you are writing something that must work with
classes it has never seen: a test runner, a serialiser, a dependency injector,
a plugin loader, a debugger. That is a short list, and you are usually *using*
one of those rather than writing one.

It is the wrong tool inside application logic, for four reasons that have
nothing to do with speed:

- **The compiler stops helping.** `getDeclaredMethod("procss", ...)` compiles.
- **Refactoring stops working.** Rename a field and every reflective reference
  to it by name is silently wrong; your IDE cannot see them.
- **Dead-code analysis stops working.** A method only ever called reflectively
  looks unused to every tool, including the ones that strip unused code.
- **Ahead-of-time compilation stops working**, or needs a configuration file
  listing every reflective access — which is exactly what native-image builds
  ask for.

If you find yourself reaching for reflection to reach a private field, the
design usually wants changing instead. If you are reaching for it to pick a
behaviour by name, a `Map<String, Runnable>` built with method references —
chapter 6.2's registry — does the same job with the compiler still watching.

:::quiz
{
  "question": "A framework's `@Test` annotation is declared with `@Retention(RetentionPolicy.CLASS)`. What happens?",
  "options": [
    { "text": "The annotation is written into the class file but not loaded into memory, so `getAnnotation` returns null and no tests are found", "correct": true, "why": "Right — CLASS is the default retention, and only RUNTIME is visible to reflection. This is the classic silent failure in a hand-rolled framework." },
    { "text": "It works, since CLASS retention keeps the annotation in the compiled class where reflection reads it from", "correct": false, "why": "Reflection reads from the loaded runtime representation, not from the file. CLASS-retained annotations are skipped when the class is loaded." },
    { "text": "javac rejects the annotation declaration, because @Test must be RUNTIME", "correct": false, "why": "javac has no idea what you intend to do with it; every retention policy is legal on any annotation." },
    { "text": "The tests run but the annotation's members cannot be read", "correct": false, "why": "There is no partial visibility — the annotation is either present at run time or it is not." }
  ]
}
:::

## Practice

:::exercise tiny-injector

:::exercise annotation-driven-validation

:::recap
- The class file keeps names, signatures, generic types, annotations and record
  components; `java.lang.reflect` reads them back.
- `getDeclaredX` sees everything this class declares; `getX` sees public
  members including inherited ones. **The order is unspecified** — sort it.
- An annotation is visible to reflection only with
  `@Retention(RetentionPolicy.RUNTIME)`. `SOURCE` is discarded by `javac`;
  `CLASS`, the default, is not loaded.
- `invoke` wraps whatever the target throws in `InvocationTargetException`;
  the real failure is `getCause()`.
- `setAccessible` opens your own code and is refused across a module boundary
  — `java.base` internals need `--add-opens`.
- `getGenericType()` recovers the declared type arguments erasure removed from
  the type itself.
- Cost, measured: `Method.invoke` about twenty-five times a direct call,
  `MethodHandle.invokeExact` about seven; repeating the lookup costs another
  five. Look members up once and keep them.
- Use it to write frameworks, not application logic — it disables the compiler,
  refactoring, dead-code analysis and ahead-of-time compilation.
