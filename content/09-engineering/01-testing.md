---
title: "Testing — and what a test framework actually does"
navTitle: "Testing"
summary: >-
  A hundred lines of reflection is a test framework. Knowing that changes what you expect from JUnit, and what you write yourself.
objectives:
  - Build a working test framework from annotations and reflection
  - Map its pieces onto JUnit 5
  - Write tests that fail for one reason and say what it is
  - Make untestable code testable by injecting the thing that varies
status: complete
standard: java21
requires: [parallel-streams]
---

Chapter 7.4 built a twelve-line test runner to demonstrate reflection. This
chapter finishes it, because a framework you have written is a framework you
can reason about — and most confusion about JUnit is confusion about which part
is magic (none of it) and which part is convention (most of it).

Everything runnable here uses no library at all. JUnit itself appears in
clearly-marked blocks that are not compiled, because this book's runner has no
third-party classpath and nothing is shown running unless it runs.

## A framework, in one file

```java run title="Annotations, lifecycle, assertions, a report"
import java.lang.annotation.*;
import java.lang.reflect.*;
import java.util.*;

public class Main {
    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface Test {
    }

    @Retention(RetentionPolicy.RUNTIME)
    @Target(ElementType.METHOD)
    @interface BeforeEach {
    }

    static final class Assertions {
        static void assertEquals(Object expected, Object actual) {
            if (!Objects.equals(expected, actual)) {
                throw new AssertionError("expected <" + expected + "> but was <" + actual + ">");
            }
        }

        static void assertTrue(boolean condition, String description) {
            if (!condition) {
                throw new AssertionError(description);
            }
        }

        static <T extends Throwable> T assertThrows(Class<T> expected, Runnable body) {
            try {
                body.run();
            } catch (Throwable actual) {
                if (expected.isInstance(actual)) {
                    return expected.cast(actual);
                }
                throw new AssertionError("expected " + expected.getSimpleName() + " but threw " + actual);
            }
            throw new AssertionError("expected " + expected.getSimpleName() + " but nothing was thrown");
        }
    }

    static final class StackTests {
        private Deque<String> stack;

        @BeforeEach
        void freshStack() {
            stack = new ArrayDeque<>();
        }

        @Test
        void aNewStackIsEmpty() {
            Assertions.assertTrue(stack.isEmpty(), "a new stack should be empty");
        }

        @Test
        void popsInReverseOrder() {
            stack.push("a");
            stack.push("b");
            Assertions.assertEquals("b", stack.pop());
            Assertions.assertEquals("a", stack.pop());
        }

        @Test
        void poppingAnEmptyStackThrows() {
            Assertions.assertThrows(NoSuchElementException.class, () -> stack.pop());
        }

        @Test
        void thisOneIsDeliberatelyWrong() {
            stack.push("a");
            Assertions.assertEquals("b", stack.peek());
        }

        void notATest() {
            throw new AssertionError("never called");
        }
    }

    record Result(String name, String failure) {
    }

    static List<Result> run(Class<?> suite) throws Exception {
        Method[] methods = suite.getDeclaredMethods();
        Arrays.sort(methods, Comparator.comparing(Method::getName));

        List<Result> results = new ArrayList<>();
        for (Method test : methods) {
            if (!test.isAnnotationPresent(Test.class)) {
                continue;
            }
            Object instance = suite.getDeclaredConstructor().newInstance();
            for (Method before : methods) {
                if (before.isAnnotationPresent(BeforeEach.class)) {
                    before.setAccessible(true);
                    before.invoke(instance);
                }
            }
            test.setAccessible(true);
            try {
                test.invoke(instance);
                results.add(new Result(test.getName(), null));
            } catch (InvocationTargetException wrapped) {
                results.add(new Result(test.getName(), wrapped.getCause().getMessage()));
            }
        }
        return results;
    }

    public static void main(String[] args) throws Exception {
        int passed = 0;
        int failed = 0;
        for (Result result : run(StackTests.class)) {
            if (result.failure() == null) {
                System.out.println("PASS  " + result.name());
                passed++;
            } else {
                System.out.println("FAIL  " + result.name() + ": " + result.failure());
                failed++;
            }
        }
        System.out.println(passed + " passed, " + failed + " failed");
    }
}
```

That is a test framework. Every idea JUnit has is in there:

- **Discovery** — find methods carrying an annotation. `@Retention(RUNTIME)`
  is what makes them visible, and forgetting it is the classic silent failure
  (chapter 7.4).
- **A fresh instance per test.** `getDeclaredConstructor().newInstance()` runs
  inside the loop, so `stack` cannot leak from one test into the next. JUnit 5
  does exactly this, and it is why tests must not depend on each other or on
  order.
- **Lifecycle** — `@BeforeEach` runs before each test, on the same instance.
- **Assertions** that throw, so the first failure ends that test and no other.
- **Failure isolation** — `invoke` wraps whatever the test threw in
  `InvocationTargetException`, so one broken test does not stop the run.

Note the deliberate failure in the output. A test that fails must say *what was
expected and what happened*; `expected <b> but was <a>` is a complete bug
report, and `assertTrue(stack.peek().equals("b"))` would have said only
`AssertionError`.

## The same suite, in JUnit 5

```java
// Real JUnit 5. Not compiled here — this book's runner has no classpath
// beyond the file you are reading.
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;

class StackTests {
    private Deque<String> stack;

    @BeforeEach
    void freshStack() {
        stack = new ArrayDeque<>();
    }

    @Test
    @DisplayName("a new stack is empty")
    void aNewStackIsEmpty() {
        assertTrue(stack.isEmpty());
    }

    @Test
    void popsInReverseOrder() {
        stack.push("a");
        stack.push("b");
        assertEquals("b", stack.pop());
        assertEquals("a", stack.pop());
    }

    @Test
    void poppingAnEmptyStackThrows() {
        assertThrows(NoSuchElementException.class, () -> stack.pop());
    }
}
```

Line for line, the same thing. What JUnit adds is everything around the edges:
`@AfterEach` and the `@BeforeAll`/`@AfterAll` pair, `@Nested` for grouping,
`@DisplayName` for readable reports, `@ParameterizedTest` with `@ValueSource`
and `@CsvSource`, `@Disabled`, timeouts, tag-based filtering, extensions, and
an assertion library with `assertAll`, `assertIterableEquals` and the rest.

Two pieces of JUnit trivia that are worth knowing precisely:

- **`assertEquals(expected, actual)`** — expected first. Reversed, every
  failure message is backwards, and the compiler cannot tell.
- **JUnit 4 versus 5.** `org.junit.Test` is JUnit 4; `org.junit.jupiter.api.Test`
  is JUnit 5. Mixing them in one project silently runs half your tests, because
  each engine only discovers its own annotation.

## What makes a test good

The framework is the easy part. These are the parts that decide whether a suite
is worth having.

**One reason to fail.** A test named `popsInReverseOrder` that also checks the
size and the `toString` will fail for three reasons and tell you one. Split it,
or use JUnit's `assertAll` to report every failure in a group.

**Test behaviour, not implementation.** Asserting `stack.pop()` returns `"b"`
survives a rewrite; asserting that the internal array has a particular length
does not. If a test breaks whenever you refactor without changing behaviour,
the test is testing the wrong thing.

**Name the case, not the method.** `popsInReverseOrder` and
`poppingAnEmptyStackThrows` say what should be true; `testPop1` and `testPop2`
say nothing, and you will read them a hundred times more often than you write
them.

**Assert on values, not on mutable views.**

```java run title="A test that passes and proves nothing"
import java.util.*;

public class Main {
    static final class Basket {
        private final List<String> items = new ArrayList<>();

        void add(String item) {
            items.add(item);
        }

        List<String> items() {
            return items;                    // the caller can change the basket
        }
    }

    public static void main(String[] args) {
        Basket basket = new Basket();
        basket.add("apple");

        List<String> view = basket.items();
        System.out.println("test asserts:  " + view.equals(List.of("apple")));

        view.add("smuggled");
        System.out.println("after the test: " + basket.items());
        System.out.println("the assertion was true and the class is still broken");
    }
}
```

The assertion passes. It passes for a class that lets any caller edit its
contents — chapter 2.3's defensive copy, absent — because comparing a live view
against an expected value never notices that the view is live. A test that
would have caught it asserts what `items()` *is*, not only what it *contains*:
`assertThrows(UnsupportedOperationException.class, () -> basket.items().add("x"))`.

## Make the untestable testable

The commonest reason a piece of code is hard to test is that it reaches out and
grabs something instead of being handed it. Chapter 7.7 already named the fix
for time:

```java run title="Two versions of the same method"
import java.time.*;
import java.time.format.DateTimeFormatter;

public class Main {
    static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    // Reaches out and grabs the clock.
    static String receiptNow(String item) {
        return item + " at " + LocalDateTime.now().format(STAMP);
    }

    // Is handed one.
    static String receipt(String item, Clock clock) {
        return item + " at " + LocalDateTime.now(clock).format(STAMP);
    }

    public static void main(String[] args) {
        System.out.println("untestable version: " + receiptNow("coffee"));
        System.out.println("  the only assertion available is a weak one: "
            + (receiptNow("coffee").startsWith("coffee at ")));

        Clock fixed = Clock.fixed(Instant.parse("2026-03-08T09:15:00Z"), ZoneOffset.UTC);
        System.out.println("testable version:   " + receipt("coffee", fixed));
        System.out.println("  exact assertion:  "
            + receipt("coffee", fixed).equals("coffee at 2026-03-08 09:15"));
    }
}
```

The first can only be tested with a `startsWith` — a weak assertion that would
still pass if the timestamp were wrong. The second can be asserted exactly, in
one line, forever.

The same move works for everything that varies: randomness (take a `Random`
with a seed), the filesystem (take a `Path` to a temporary directory, as
`line-index` in chapter 7.6 did), the network (take an interface you can
implement with a fake), and the current user. **If a test is hard to write,
that is information about the design, not about testing.**

A fake is usually better than a mocking framework:

```java run title="A fake is just an implementation"
import java.util.*;

public class Main {
    interface Rates {
        double rateFor(String currency);
    }

    record FixedRates(Map<String, Double> rates) implements Rates {
        @Override
        public double rateFor(String currency) {
            Double rate = rates.get(currency);
            if (rate == null) {
                throw new NoSuchElementException("no rate for " + currency);
            }
            return rate;
        }
    }

    static long convertToPence(long amount, String currency, Rates rates) {
        return Math.round(amount * rates.rateFor(currency));
    }

    public static void main(String[] args) {
        Rates rates = new FixedRates(Map.of("USD", 0.79, "EUR", 0.85));

        System.out.println("100 USD -> " + convertToPence(100, "USD", rates) + "p");
        System.out.println("100 EUR -> " + convertToPence(100, "EUR", rates) + "p");

        try {
            convertToPence(100, "JPY", rates);
        } catch (NoSuchElementException expected) {
            System.out.println("unknown currency: " + expected.getMessage());
        }
    }
}
```

Ten lines, no library, and it behaves like the real thing rather than
replaying a script of expected calls. Reach for a mocking framework when you
must assert that an interaction *happened* — that an email was sent — and
prefer a fake everywhere else.

## Tests that lie

Three shapes to recognise:

**The test that cannot fail.** An assertion inside an `if` that is never true,
a `try` whose `catch` swallows the `AssertionError`, or a test whose body was
commented out. Introduce a deliberate bug occasionally and check that the test
goes red; a suite nobody has seen fail is a suite nobody should trust.

**The order-dependent test.** Shared static state, a database left dirty, or
an assertion on `HashMap` iteration order (chapter 4.3). It passes in your IDE
and fails in CI, or the other way round. A fresh instance per test — which the
framework above does deliberately — removes most of it; `static` mutable
fields put it back.

**The timing test.** `Thread.sleep(100); assertTrue(done)` passes on a fast
machine and fails on a loaded build agent. Wait for the condition with a
`CountDownLatch` or a bounded `join(timeout)`, as chapters 8.1 and 8.5 did,
rather than for a duration.

:::quiz
{
  "question": "Every method in a JUnit 5 suite is annotated `@Test`, and running it reports zero tests. What is the most likely cause?",
  "options": [
    { "text": "The import is `org.junit.Test` (JUnit 4) while the runner is JUnit 5, which only discovers `org.junit.jupiter.api.Test`", "correct": true, "why": "Right — the annotations have the same simple name and different packages, so the file compiles and the engine finds nothing." },
    { "text": "The test methods are package-private, and JUnit requires them to be public", "correct": false, "why": "JUnit 5 dropped that requirement — package-private test methods are the recommended style." },
    { "text": "The class is not named *Test, so it was not compiled", "correct": false, "why": "Naming conventions affect which classes a build tool scans, not whether they compile, and the report would then say the class was not found rather than zero tests." },
    { "text": "`@Retention(RUNTIME)` is missing from JUnit's own annotation", "correct": false, "why": "JUnit's annotations are declared correctly; that is the failure mode for an annotation you declared yourself." }
  ]
}
:::

## Practice

:::exercise mini-test-framework

:::exercise make-it-testable

:::recap
- A test framework is discovery by annotation, a fresh instance per test,
  lifecycle hooks, assertions that throw, and failure isolation through
  `InvocationTargetException`. All of it fits in one file.
- JUnit 5 adds `@BeforeAll`/`@AfterEach`, `@Nested`, `@DisplayName`,
  `@ParameterizedTest`, timeouts and extensions — conventions and convenience,
  not magic.
- `assertEquals(expected, actual)` takes expected first, and `org.junit.Test`
  (4) is not `org.junit.jupiter.api.Test` (5).
- A good test has one reason to fail, tests behaviour rather than
  implementation, and is named after the case.
- Asserting on a mutable view can pass while the class is broken; assert on
  what a method returns, including that it is unmodifiable.
- Hard to test means badly designed: inject the `Clock`, the seed, the `Path`,
  the collaborator. A hand-written fake beats a mock unless you must assert
  that an interaction happened.
- Distrust tests that cannot fail, tests that depend on order, and tests that
  depend on how long something takes.
