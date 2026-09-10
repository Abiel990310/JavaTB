---
id: record-the-point
title: "Delete thirty lines"
difficulty: intro
chapter: records
topics: [records, equals]
check: unit
standard: java21
---

Below is the hand-written `Point` from chapter 2.4, with `equals`, `hashCode`
and `toString` spelled out.

Replace the whole thing with a record that behaves identically, and add one
method: `scaled(int factor)`, returning a new `Point` with both coordinates
multiplied.

`toString()` must produce `Point[x=3, y=4]`, which is what a record generates —
note that this differs from the hand-written version's `Point(3, 4)`, and the
checks expect the record's format.

## Starter
```java
static final class Point {
    private final int x;
    private final int y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    int x() {
        return x;
    }

    int y() {
        return y;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Point other)) {
            return false;
        }
        return x == other.x && y == other.y;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y);
    }

    @Override
    public String toString() {
        return "Point(" + x + ", " + y + ")";
    }
}
```

## Tests
```java
Point a = new Point(3, 4);
Point b = new Point(3, 4);

checkEq(a.x(), 3);
checkEq(a.y(), 4);
check(a.equals(b));
checkEq(a.hashCode(), b.hashCode());
checkEq(a.toString(), "Point[x=3, y=4]");

checkEq(a.scaled(2), new Point(6, 8));
checkEq(a.scaled(0), new Point(0, 0));
checkEq(a.scaled(-1), new Point(-3, -4));
checkEq(a, new Point(3, 4));

Set<Point> points = new HashSet<>();
points.add(a);
points.add(b);
checkEq(points.size(), 1);
```

## Hints
- `record Point(int x, int y) { }` replaces everything above the methods.
- A record body can hold ordinary methods. `scaled` goes inside the braces.
- Inside a record's methods, the components are readable by name — `x` and `y`,
  no `this.` required.

## Solution
```java
record Point(int x, int y) {
    Point scaled(int factor) {
        return new Point(x * factor, y * factor);
    }
}
```

## Notes
Four lines replace thirty-eight, and the four cannot go wrong in any of the
ways the thirty-eight could. There is no `equals` to write with the wrong
parameter type, no `hashCode` to forget, and no possibility of adding a third
component and updating two of the three generated methods.

`scaled` returns a new `Point` rather than modifying this one, and it has no
choice — a record's components are final. That constraint is the feature: a
type that cannot be mutated is safe to share, safe as a map key, and safe to
hand to another thread, which is what chapters 2.2 and 2.4 spent their length
arguing for and what a record gives you by default.

Note the `toString` format is not negotiable without overriding it. The
generated one is always `TypeName[component=value, ...]`, which is why the
checks expect `Point[x=3, y=4]` rather than the hand-written `Point(3, 4)`. If
a specific format matters — a log line another system parses — override
`toString` explicitly, and then remember chapter 2.4's advice that nothing
should be parsing it in the first place.

You can also add a compact constructor to a record like this one and keep
everything else generated, which is the next problem.
