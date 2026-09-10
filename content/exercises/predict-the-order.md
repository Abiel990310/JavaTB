---
id: predict-the-order
title: "Predict the order"
difficulty: core
chapter: class-loading
topics: [class-loading, initialisation, constructors]
check: unit
standard: java21
---

No rewriting this time — the code is fixed. Write down what it does, as a
program that records the order for real.

You are given `Base` and `Sub`, each of which appends a line to a shared log
at every initialisation point. Implement:

- `static List<String> orderOfNewSub()` — the log produced by evaluating
  `new Sub(7)` once, in a fresh JVM state
- `static List<String> orderOfTwoSubs()` — the log for `new Sub(1)` followed by
  `new Sub(2)`
- `static String describeDuringConstruction()` — the value `Base`'s constructor
  sees when it calls `label()`
- `static int constantWithoutInit()` — reads `Config.LIMIT` and returns it
  **without** initialising `Config`
- `static int computedWithInit()` — reads `Config.SCALE`, which does initialise
  `Config`

`LOG` and the classes are given; only the five methods are yours.

## Starter
```java
static final List<String> LOG = new ArrayList<>();

static class Base {
    static { LOG.add("Base static"); }

    { LOG.add("Base instance block"); }

    Base() {
        LOG.add("Base constructor sees " + label());
    }

    String label() {
        return "Base";
    }
}

static class Sub extends Base {
    static { LOG.add("Sub static"); }

    private final int size;

    { LOG.add("Sub instance block"); }

    Sub(int size) {
        super();
        this.size = size;
        LOG.add("Sub constructor, size = " + size);
    }

    @Override
    String label() {
        return "size = " + size;
    }
}

static class Config {
    static final int LIMIT = 10;
    static final int SCALE = Integer.parseInt("3");

    static { LOG.add("Config static"); }
}

static List<String> orderOfNewSub() {
    return List.of();
}

static List<String> orderOfTwoSubs() {
    return List.of();
}

static String describeDuringConstruction() {
    return "";
}

static int constantWithoutInit() {
    return 0;
}

static int computedWithInit() {
    return 0;
}
```

## Tests
```java
List<String> first = orderOfNewSub();
checkEq(first, List.of(
    "Base static",
    "Sub static",
    "Base instance block",
    "Base constructor sees size = 0",
    "Sub instance block",
    "Sub constructor, size = 7"));

checkEq(describeDuringConstruction(), "size = 0");

// The constant does not initialise its class.
LOG.clear();
checkEq(constantWithoutInit(), 10);
checkEq(LOG, List.of());

// The computed one does.
checkEq(computedWithInit(), 3);
checkEq(LOG, List.of("Config static"));

// And only once.
LOG.clear();
checkEq(computedWithInit(), 3);
checkEq(LOG, List.of());

List<String> twice = orderOfTwoSubs();
checkEq(twice, List.of(
    "Base instance block",
    "Base constructor sees size = 0",
    "Sub instance block",
    "Sub constructor, size = 1",
    "Base instance block",
    "Base constructor sees size = 0",
    "Sub instance block",
    "Sub constructor, size = 2"));
```

## Hints
- Each method must clear `LOG`, do its work, and return a copy — otherwise the
  next method sees the previous one's lines.
- The static lines appear in the *first* method to construct a `Sub` and never
  again, which is why `orderOfTwoSubs` must run after `orderOfNewSub` and shows
  no static lines. Do not try to make them repeat; you cannot.
- `label()` is overridden, so `Base`'s constructor calls `Sub`'s version. Ask
  what `size` holds at that moment.
- `Config.LIMIT` is `static final int` with a literal initialiser. Read the
  chapter's section on compile-time constants and then just read the field.
- `describeDuringConstruction` can pull the answer out of a log rather than
  duplicating the reasoning.

## Solution
```java
static final List<String> LOG = new ArrayList<>();

static class Base {
    static { LOG.add("Base static"); }

    { LOG.add("Base instance block"); }

    Base() {
        LOG.add("Base constructor sees " + label());
    }

    String label() {
        return "Base";
    }
}

static class Sub extends Base {
    static { LOG.add("Sub static"); }

    private final int size;

    { LOG.add("Sub instance block"); }

    Sub(int size) {
        super();
        this.size = size;
        LOG.add("Sub constructor, size = " + size);
    }

    @Override
    String label() {
        return "size = " + size;
    }
}

static class Config {
    static final int LIMIT = 10;
    static final int SCALE = Integer.parseInt("3");

    static { LOG.add("Config static"); }
}

static List<String> orderOfNewSub() {
    LOG.clear();
    new Sub(7);
    return List.copyOf(LOG);
}

static List<String> orderOfTwoSubs() {
    LOG.clear();
    new Sub(1);
    new Sub(2);
    return List.copyOf(LOG);
}

static String describeDuringConstruction() {
    LOG.clear();
    new Sub(7);
    for (String line : LOG) {
        if (line.startsWith("Base constructor sees ")) {
            return line.substring("Base constructor sees ".length());
        }
    }
    throw new IllegalStateException("the constructor did not log");
}

static int constantWithoutInit() {
    return Config.LIMIT;
}

static int computedWithInit() {
    return Config.SCALE;
}
```

## Notes
Three things in the expected log are worth staring at.

**`"Base constructor sees size = 0"`.** `size` is `final` and is assigned `7`
in the constructor, and at the moment `Base`'s constructor runs it is `0`. The
assignment has not happened yet, because `super()` runs first and `label()` is
virtual. This is the whole `this`-escape hazard in one line of expected output,
and it is why the rule is *never call an overridable method from a
constructor* — not "be careful when you do".

**The static lines appear once, in whichever method runs first.** The tests
depend on `orderOfNewSub` being called before `orderOfTwoSubs`, which is
uncomfortable but honest: class initialisation is a property of the JVM, not of
your method, and no amount of clearing a log can undo it. If you wanted the
statics to run again you would need a fresh class loader, which is exactly what
application servers do to redeploy an application and exactly why redeployment
is such a rich source of leaks.

**`constantWithoutInit` leaves `LOG` empty.** `Config.LIMIT` compiles to the
literal `10`; there is no field read in the bytecode and therefore no reason
for the JVM to initialise `Config`. Change `LIMIT` to `static final int LIMIT =
Integer.parseInt("10")` — same type, same value, same `final` — and the test
fails, because the initialiser is no longer a constant expression.

That last difference is the one to carry: whether a `static final` field is
inlined depends on the *initialiser*, not on the modifiers or the type alone.
`static final int` with a literal is inlined; `static final int` with a method
call is not; `static final String` with a literal is inlined; `static final
List<String>` never is, because only primitives and `String` can be constant
expressions at all.
