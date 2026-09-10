---
id: value-equality
title: "Make a value type behave like one"
difficulty: core
chapter: equals-and-hashcode
topics: [equals, hashCode, contracts]
check: unit
standard: java21
---

Give the `Point` class below a working `equals`, `hashCode` and `toString`.

Two points are equal when both coordinates match. `toString` must return
exactly `Point(3, 4)` for `new Point(3, 4)` — the class name, then the two
values in parentheses, separated by a comma and a space.

The starter has an `equals` already. It compiles, it looks right, and it does
not work.

## Starter
```java
static final class Point {
    private final int x;
    private final int y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public boolean equals(Point other) {
        return x == other.x && y == other.y;
    }

    public String toString() {
        return "Point(" + x + ", " + y + ")";
    }
}
```

## Tests
```java
Point a = new Point(3, 4);
Point b = new Point(3, 4);
Point c = new Point(3, 5);

checkEq(a.toString(), "Point(3, 4)");
check(a.equals(b));
check(!a.equals(c));

Object asObject = b;
check(a.equals(asObject));

check(!a.equals(null));
check(!a.equals("Point(3, 4)"));
checkEq(a.hashCode(), b.hashCode());

Set<Point> points = new HashSet<>();
points.add(a);
check(points.contains(b));
points.add(b);
checkEq(points.size(), 1);
```

## Hints
- `a.equals(b)` passes but `a.equals(asObject)` fails, with the same object
  behind both names. What does that tell you about which method is being
  called?
- The method the library calls takes an `Object`, not a `Point`. The starter
  declares an *overload*, not an override.
- Add `@Override` to the starter's `equals` and the compiler will tell you the
  same thing.
- `o instanceof Point other` tests the type, casts, and rejects `null` in one
  expression. Then add a `hashCode` built from the same two fields.

## Solution
```java
static final class Point {
    private final int x;
    private final int y;

    Point(int x, int y) {
        this.x = x;
        this.y = y;
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

## Notes
`public boolean equals(Point other)` is a perfectly ordinary method that
happens to share a name with the one `Object` declares. Because its parameter
type is different, it does not override anything — it overloads. The compiler
picks between them at compile time using the *declared* type of the argument,
exactly as chapter 1.4 described, so `a.equals(b)` with both declared `Point`
calls the new one and appears to work.

Everything that goes through the library declares its argument as `Object`.
`HashSet.contains`, `List.remove`, `Objects.equals` — all of them call
`equals(Object)`, get the inherited identity version, and report that your two
equal points are different. That is why `a.equals(asObject)` is in the checks:
it is the same object as `b`, named through a variable of a different declared
type, and that alone changes the answer.

`@Override` on the starter's method would have refused to compile with *method
does not override or implement a method from a supertype*. Write it on every
method you intend as an override; it costs nothing and it turns this entire
class of bug into a compile error.

The `this == o` first line is not required, but it is worth keeping: it makes
reflexivity true by construction and short-circuits the common case of
comparing an object with itself.
