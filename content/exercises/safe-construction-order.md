---
id: safe-construction-order
title: "A constructor that finishes first"
difficulty: stretch
chapter: class-loading
topics: [constructors, this-escape, initialisation, singletons]
check: unit
standard: java21
---

Three classes, three ways of letting `this` out before it is ready. Fix each
without changing what the class is for.

**`Shape`** publishes itself to a registry from its constructor, so a
half-built subclass ends up in a shared list:

- `abstract static class Shape` with `abstract double area()` and
  `String describe()` returning `name + " area " + area()`
- Every `Shape` must appear in `Registry.all()` in creation order — but only
  once it is **fully constructed**
- `Registry.all()` is unmodifiable; `Registry.clear()` empties it

**`Report`** calls an overridable method from its constructor:

- `Report(String title)`, `String render()` returning
  `header() + "|" + body()`
- `header()` is `"# " + title`; `body()` is `"(empty)"` by default
- `DetailedReport(String title, List<String> lines)` overrides `body()` to
  join its lines with `", "`, or `"(empty)"` when there are none
- Building a `DetailedReport` must not observe a null `lines`

**`Counter`** uses a lazily built singleton whose holder is initialised too
eagerly:

- `Counter.instance()` returns the one instance; `Counter.buildCount()` says
  how many were built
- Calling `Counter.describe()` — which does not need the instance — must not
  build one

## Starter
```java
static final class Registry {
    private static final List<Shape> ALL = new ArrayList<>();

    static void add(Shape shape) {
        ALL.add(shape);
    }

    static List<Shape> all() {
        return List.copyOf(ALL);
    }

    static void clear() {
        ALL.clear();
    }
}

abstract static class Shape {
    private final String name;

    Shape(String name) {
        this.name = name;
        Registry.add(this);              // published before the subclass is ready
    }

    abstract double area();

    String describe() {
        return name + " area " + area();
    }
}

static final class Square extends Shape {
    private final double side;

    Square(double side) {
        super("square");
        this.side = side;
    }

    @Override
    double area() {
        return side * side;
    }
}

static class Report {
    private final String title;
    private final String rendered;

    Report(String title) {
        this.title = title;
        this.rendered = header() + "|" + body();     // calls an override
    }

    String header() {
        return "# " + title;
    }

    String body() {
        return "(empty)";
    }

    String render() {
        return rendered;
    }
}

static final class DetailedReport extends Report {
    private final List<String> lines;

    DetailedReport(String title, List<String> lines) {
        super(title);
        this.lines = List.copyOf(lines);
    }

    @Override
    String body() {
        return lines.isEmpty() ? "(empty)" : String.join(", ", lines);
    }
}

static final class Counter {
    private static int built;
    static final Counter INSTANCE = new Counter();    // built on first touch of Counter

    private Counter() {
        built++;
    }

    static Counter instance() {
        return INSTANCE;
    }

    static int buildCount() {
        return built;
    }

    static String describe() {
        return "a counter";
    }
}
```

## Tests
```java
Registry.clear();
Square small = new Square(2);
Square large = new Square(3);

checkEq(Registry.all().size(), 2);
checkEq(Registry.all().get(0).describe(), "square area 4.0");
checkEq(Registry.all().get(1).describe(), "square area 9.0");
checkThrows(UnsupportedOperationException.class, () -> Registry.all().add(small));

// Whatever the registry holds must already be usable — no zero areas.
Registry.clear();
new Square(5);
checkEq(Registry.all().size(), 1);
checkEq(Registry.all().get(0).area(), 25.0);
checkEq(Registry.all().get(0).describe(), "square area 25.0");

Report plain = new Report("plain");
checkEq(plain.render(), "# plain|(empty)");

DetailedReport detailed = new DetailedReport("sales", List.of("north", "south"));
checkEq(detailed.render(), "# sales|north, south");
checkEq(detailed.body(), "north, south");

DetailedReport nothing = new DetailedReport("empty", List.of());
checkEq(nothing.render(), "# empty|(empty)");

// The counter is not built by a call that does not need it.
checkEq(Counter.describe(), "a counter");
checkEq(Counter.buildCount(), 0);
Counter one = Counter.instance();
checkEq(Counter.buildCount(), 1);
Counter two = Counter.instance();
check(one == two);
checkEq(Counter.buildCount(), 1);
```

## Hints
- `Shape` cannot register itself and be finished at the same time. Move the
  registration to a factory, or register in the concrete subclass's
  constructor as its very last statement — the tests only require that whatever
  reaches the registry is usable.
- The cleanest fix for `Shape` is a `static Square of(double side)` that builds
  then registers. But the tests call `new Square(...)` directly, so the
  registration has to stay inside a constructor: put it at the end of the
  *concrete* one, where the object really is complete.
- `Report` should not call `body()` from its constructor at all. Render on
  demand in `render()`, which runs long after every constructor has finished.
- `Counter`'s `INSTANCE` is a static field of `Counter` itself, so any static
  call — `describe()` included — initialises the class and builds it. Move
  `INSTANCE` into a private nested holder class.

## Solution
```java
static final class Registry {
    private static final List<Shape> ALL = new ArrayList<>();

    static void add(Shape shape) {
        ALL.add(shape);
    }

    static List<Shape> all() {
        return List.copyOf(ALL);
    }

    static void clear() {
        ALL.clear();
    }
}

abstract static class Shape {
    private final String name;

    Shape(String name) {
        this.name = name;
    }

    abstract double area();

    String describe() {
        return name + " area " + area();
    }
}

static final class Square extends Shape {
    private final double side;

    Square(double side) {
        super("square");
        this.side = side;
        Registry.add(this);        // last statement of a final class: nothing left to run
    }

    @Override
    double area() {
        return side * side;
    }
}

static class Report {
    private final String title;

    Report(String title) {
        this.title = title;
    }

    String header() {
        return "# " + title;
    }

    String body() {
        return "(empty)";
    }

    String render() {
        return header() + "|" + body();
    }
}

static final class DetailedReport extends Report {
    private final List<String> lines;

    DetailedReport(String title, List<String> lines) {
        super(title);
        this.lines = List.copyOf(lines);
    }

    @Override
    String body() {
        return lines.isEmpty() ? "(empty)" : String.join(", ", lines);
    }
}

static final class Counter {
    private static int built;

    private static final class Holder {
        static final Counter INSTANCE = new Counter();
    }

    private Counter() {
        built++;
    }

    static Counter instance() {
        return Holder.INSTANCE;
    }

    static int buildCount() {
        return built;
    }

    static String describe() {
        return "a counter";
    }
}
```

## Notes
All three starters compile, run, and produce wrong answers quietly.

`Shape` registers `this` from the base constructor, so the registry receives an
object whose `side` is still `0.0` — and because the registry holds it forever,
a reader who calls `area()` later sees `25.0` and never suspects. The test that
catches it is the one calling `area()` on the *registered* object rather than
on the variable. Moving the registration to the last statement of `Square`'s
constructor works only because `Square` is `final`: nothing can extend it, so
there is no further constructor waiting to run. In a non-final class the same
line is the bug again, one level down, which is why a static factory is the
answer that always works.

`Report` computes `rendered` in the constructor, calling `body()` before
`DetailedReport` has assigned `lines`. The result is not a wrong string, it is
a `NullPointerException` from `lines.isEmpty()` — the failure arrives inside a
method that looks correct, called from a constructor that has already returned
by the time anyone reads the stack trace. Rendering on demand removes the
question entirely and costs nothing here; if it were expensive, the answer
would be a lazily-computed cached field, still evaluated after construction.

`Counter` is chapter 7.3's holder idiom, missing. `INSTANCE` declared in
`Counter` is initialised by any active use of `Counter`, and `describe()` is a
static method call — an active use. Nesting it in `Holder` means the instance
is built when `Holder.INSTANCE` is first read and at no other time, with the
class initialisation lock providing the thread safety for free. The test that
proves it is `buildCount() == 0` after `describe()`.

The pattern behind all three: a constructor's job is to make one object
consistent, and anything that lets the outside world *see* the object before
that job is done is the same bug wearing different clothes — a registry, a
virtual call, or a static field that runs too early.
