---
id: mini-test-framework
title: "Finish the test framework"
difficulty: core
chapter: testing
topics: [testing, reflection, annotations, lifecycle]
check: unit
standard: java21
---

The chapter's framework handles `@Test` and `@BeforeEach`. Finish it.

- `@Test`, `@BeforeEach`, `@AfterEach`, `@Disabled` — all `RUNTIME`, all on
  methods
- `record Report(int passed, int failed, int skipped, List<String> lines) {}`
- `static Report run(Class<?> suite)` — for each `@Test` method, in
  **alphabetical order by method name**:
  - a `@Disabled` test is skipped, contributing `"SKIP <name>"`
  - otherwise a fresh instance is built, every `@BeforeEach` runs, the test
    runs, and every `@AfterEach` runs **even when the test failed**
  - a pass contributes `"PASS <name>"`, a failure `"FAIL <name>: <message>"`
    taking the original exception's message
  - a test that throws something with no message contributes
    `"FAIL <name>: <SimpleName>"`
- Assertions: `assertEquals(Object, Object)`, `assertTrue(boolean, String)`,
  and `assertThrows(Class, Runnable)` returning the caught exception. Messages
  are given below and must match exactly.

## Starter
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Test {}
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface BeforeEach {}
@Target(ElementType.METHOD) @interface AfterEach {}
@Target(ElementType.METHOD) @interface Disabled {}

record Report(int passed, int failed, int skipped, List<String> lines) {}

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
    body.run();
    return null;
}

static Report run(Class<?> suite) throws Exception {
    Object instance = suite.getDeclaredConstructor().newInstance();
    int passed = 0;
    int failed = 0;
    List<String> lines = new ArrayList<>();
    for (Method method : suite.getDeclaredMethods()) {
        if (!method.isAnnotationPresent(Test.class)) {
            continue;
        }
        method.setAccessible(true);
        try {
            method.invoke(instance);
            lines.add("PASS " + method.getName());
            passed++;
        } catch (InvocationTargetException wrapped) {
            lines.add("FAIL " + method.getName() + ": " + wrapped.getMessage());
            failed++;
        }
    }
    return new Report(passed, failed, 0, lines);
}

static final class Empty {
}

static final class Suite {
    static final List<String> EVENTS = new ArrayList<>();
    static int INSTANCES = 0;

    private int value;

    Suite() {
        INSTANCES++;
    }

    @BeforeEach
    void setUp() {
        value = 1;
        EVENTS.add("before");
    }

    @AfterEach
    void tearDown() {
        EVENTS.add("after");
    }

    @Test
    void aPasses() {
        assertTrue(true, "always");
    }

    @Test
    @Disabled
    void bIsDisabled() {
        throw new AssertionError("never runs");
    }

    @Test
    void cFails() {
        assertEquals(2, value);
    }

    @Test
    void dThrowsWithoutMessage() {
        throw new IllegalStateException();
    }

    @Test
    void eUsesTheFixture() {
        assertEquals(1, value);
    }
}
```

## Tests
```java
import java.lang.reflect.*;

// The assertions themselves.
assertEquals("a", "a");
assertEquals(null, null);
AssertionError mismatch = assertThrows(AssertionError.class, () -> assertEquals("b", "a"));
checkEq(mismatch.getMessage(), "expected <b> but was <a>");

assertTrue(true, "fine");
checkEq(assertThrows(AssertionError.class, () -> assertTrue(false, "the sky is green")).getMessage(),
        "the sky is green");

checkEq(assertThrows(IllegalStateException.class, () -> { throw new IllegalStateException("boom"); }).getMessage(),
        "boom");
checkEq(assertThrows(AssertionError.class, () -> assertThrows(IllegalStateException.class, () -> { })).getMessage(),
        "expected IllegalStateException but nothing was thrown");
check(assertThrows(AssertionError.class,
        () -> assertThrows(IllegalStateException.class, () -> { throw new NoSuchElementException("other"); }))
    .getMessage().startsWith("expected IllegalStateException but threw"));

Report report = run(Suite.class);
checkEq(report.lines(), List.of(
    "PASS aPasses",
    "SKIP bIsDisabled",
    "FAIL cFails: expected <2> but was <1>",
    "FAIL dThrowsWithoutMessage: IllegalStateException",
    "PASS eUsesTheFixture"));
checkEq(report.passed(), 2);
checkEq(report.failed(), 2);
checkEq(report.skipped(), 1);

// A fresh instance per test, and AfterEach runs even after a failure.
checkEq(Suite.EVENTS, List.of(
    "before", "after",      // aPasses
    "before", "after",      // cFails, and the after still runs
    "before", "after",      // dThrowsWithoutMessage
    "before", "after"));    // eUsesTheFixture
checkEq(Suite.INSTANCES, 4);

Report none = run(Empty.class);
checkEq(none.lines(), List.of());
checkEq(none.passed(), 0);
checkEq(none.failed(), 0);
checkEq(none.skipped(), 0);
```

## Hints
- Two of the four annotations have no `@Retention`, so they default to `CLASS`
  and are invisible at run time. That is chapter 7.4's bug, planted again.
- `getDeclaredMethods()` has no defined order — sort by name before looping, or
  the expected `lines` will not match.
- The fresh instance must be created **inside** the loop, once per test, and
  not at all for a skipped one — hence `INSTANCES` being 4, not 5.
- `@AfterEach` belongs in a `finally`, so it runs on both paths.
- `wrapped.getMessage()` is the wrapper's message, which is `null`-ish and
  useless. `wrapped.getCause()` is the real failure; fall back to
  `getClass().getSimpleName()` when its message is `null`.
- `assertThrows` has three outcomes: right type (return it), wrong type
  (`AssertionError` naming both), nothing thrown (`AssertionError` saying so).

## Solution
```java
import java.lang.annotation.*;
import java.lang.reflect.*;

@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Test {}
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface BeforeEach {}
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface AfterEach {}
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD) @interface Disabled {}

record Report(int passed, int failed, int skipped, List<String> lines) {}

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

static void invokeAll(Object instance, Method[] methods, Class<? extends Annotation> marker)
        throws Exception {
    for (Method method : methods) {
        if (method.isAnnotationPresent(marker)) {
            method.setAccessible(true);
            method.invoke(instance);
        }
    }
}

static Report run(Class<?> suite) throws Exception {
    Method[] methods = suite.getDeclaredMethods();
    Arrays.sort(methods, Comparator.comparing(Method::getName));

    int passed = 0;
    int failed = 0;
    int skipped = 0;
    List<String> lines = new ArrayList<>();

    for (Method test : methods) {
        if (!test.isAnnotationPresent(Test.class)) {
            continue;
        }
        if (test.isAnnotationPresent(Disabled.class)) {
            lines.add("SKIP " + test.getName());
            skipped++;
            continue;
        }

        Object instance = suite.getDeclaredConstructor().newInstance();
        invokeAll(instance, methods, BeforeEach.class);
        test.setAccessible(true);
        try {
            test.invoke(instance);
            lines.add("PASS " + test.getName());
            passed++;
        } catch (InvocationTargetException wrapped) {
            Throwable cause = wrapped.getCause();
            String message = cause.getMessage() != null
                ? cause.getMessage()
                : cause.getClass().getSimpleName();
            lines.add("FAIL " + test.getName() + ": " + message);
            failed++;
        } finally {
            invokeAll(instance, methods, AfterEach.class);
        }
    }
    return new Report(passed, failed, skipped, List.copyOf(lines));
}

static final class Empty {
}

static final class Suite {
    static final List<String> EVENTS = new ArrayList<>();
    static int INSTANCES = 0;

    private int value;

    Suite() {
        INSTANCES++;
    }

    @BeforeEach
    void setUp() {
        value = 1;
        EVENTS.add("before");
    }

    @AfterEach
    void tearDown() {
        EVENTS.add("after");
    }

    @Test
    void aPasses() {
        assertTrue(true, "always");
    }

    @Test
    @Disabled
    void bIsDisabled() {
        throw new AssertionError("never runs");
    }

    @Test
    void cFails() {
        assertEquals(2, value);
    }

    @Test
    void dThrowsWithoutMessage() {
        throw new IllegalStateException();
    }

    @Test
    void eUsesTheFixture() {
        assertEquals(1, value);
    }
}
```

## Notes
The two missing `@Retention` declarations are the first thing to find, and the
symptom is silence: `@AfterEach` and `@Disabled` compile, read correctly, and
are simply not there when `isAnnotationPresent` asks. Chapter 7.4 called this
the most common bug in a hand-rolled annotation framework; here it is in a
framework you are finishing rather than writing, which is how you will usually
meet it.

`wrapped.getMessage()` versus `wrapped.getCause().getMessage()` is the second.
`InvocationTargetException`'s own message is not the failure — it is the
wrapper's, and printing it gives you `null` or the target's `toString`
depending on the constructor used. Reflection always hands back the wrapper;
`getCause()` is always what you want. The `null`-message case matters too: an
`IllegalStateException` thrown with no argument has a `null` message, and a
report line reading `FAIL dThrows: null` helps nobody.

The **fresh instance per test** is what the `INSTANCES` assertion pins down,
and the count is 4 rather than 5 because a disabled test builds nothing. This
is JUnit 5's actual model, and it is the reason a test may not depend on
another having run. Move the `newInstance()` above the loop and every test
shares one object; `eUsesTheFixture` would then still pass, because
`@BeforeEach` resets the field — which is exactly how this bug survives.

`@AfterEach` in a `finally` is the third fault. Cleanup that only runs when the
test passes is cleanup that never runs when you need it, and a failing test
that leaves a file open or a lock held turns one red test into a red suite.
The `EVENTS` list checks the pairing directly: every `before` has a matching
`after`, including around the two failures.

Finally, the unspecified order of `getDeclaredMethods()` is why the expected
`lines` are alphabetical. The array often comes back in declaration order,
which is enough for the test to pass on one JVM and fail on another — the same
trap as `annotation-driven-validation` in chapter 7.4, and worth the one line
of sorting every time.
