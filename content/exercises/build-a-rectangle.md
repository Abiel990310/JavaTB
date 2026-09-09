---
id: build-a-rectangle
title: "A class that holds its own numbers"
difficulty: intro
chapter: classes-and-objects
topics: [classes, constructors]
check: unit
standard: java21
---

Write a class `Rectangle` with two `int` fields, `width` and `height`, a
constructor taking both, and two methods:

- `area()` returning width × height
- `perimeter()` returning twice the sum of the two sides

Declare it as a `static class` nested where your code goes — the harness
compiles everything into one file, so a second top-level class is not
available.

The starter has all the right pieces and one line repeated twice that does
nothing at all.

## Starter
```java
static class Rectangle {
    int width;
    int height;

    Rectangle(int width, int height) {
        width = width;
        height = height;
    }

    int area() {
        return width * height;
    }

    int perimeter() {
        return 2 * (width + height);
    }
}
```

## Tests
```java
Rectangle r = new Rectangle(3, 4);
checkEq(r.area(), 12);
checkEq(r.perimeter(), 14);

Rectangle square = new Rectangle(5, 5);
checkEq(square.area(), 25);
checkEq(square.perimeter(), 20);

Rectangle flat = new Rectangle(7, 1);
checkEq(flat.area(), 7);
checkEq(flat.perimeter(), 16);

Rectangle empty = new Rectangle(0, 0);
checkEq(empty.area(), 0);
```

## Hints
- Every area comes out as 0, including the ones that should not. What are the
  fields actually holding?
- Inside the constructor, `width` names the parameter, not the field — the
  parameter is nearer.
- `this.width` is the field.

## Solution
```java
static class Rectangle {
    int width;
    int height;

    Rectangle(int width, int height) {
        this.width = width;
        this.height = height;
    }

    int area() {
        return width * height;
    }

    int perimeter() {
        return 2 * (width + height);
    }
}
```

## Notes
`width = width` assigns the parameter to itself. The field is never touched, so
it keeps the default `0` that chapter 2.1 described — and `area()` dutifully
returns zero for every rectangle. The compiler is perfectly happy: assigning a
variable to itself is legal, and nothing about the line is suspicious in
isolation.

Notice that `area()` needs no `this`. Inside a method with no parameter called
`width`, the name `width` finds the field, because that is the only `width` in
scope. `this` is only *required* where something nearer has the same name,
which in practice means constructors and setters. Some codebases write
`this.width` everywhere for consistency; both styles are defensible, and the
one thing that is not is naming the parameter something else — `w`, `newWidth`
— because then the reader has to work out whether it means the same thing.

The last check exists because `new Rectangle(0, 0)` produces the same answer
whether the constructor works or not. A test that a broken implementation also
passes is not wasted — it pins down the zero case for future changes — but it
must not be the only kind you write, which is why every other check here uses
values the starter cannot fake.
