---
id: expression-evaluator
title: "Evaluate an expression tree"
difficulty: core
chapter: sealed-types
topics: [sealed, pattern matching, records]
check: unit
standard: java21
---

Model a tiny arithmetic expression as a sealed interface and evaluate it.

`Expr` permits four kinds:

- `Num(int value)` — a literal
- `Add(Expr left, Expr right)`
- `Mul(Expr left, Expr right)`
- `Neg(Expr operand)`

Write `eval(Expr e)` returning the value, using a **switch expression with no
`default` arm**, and use record patterns to reach the components.

`eval` must handle nesting to any depth: `Add(Num(1), Mul(Num(2), Num(3)))` is
7.

## Starter
```java
sealed interface Expr permits Num, Add, Mul, Neg { }

record Num(int value) implements Expr { }
record Add(Expr left, Expr right) implements Expr { }
record Mul(Expr left, Expr right) implements Expr { }
record Neg(Expr operand) implements Expr { }

static int eval(Expr e) {
    return 0;
}
```

## Tests
```java
checkEq(eval(new Num(42)), 42);
checkEq(eval(new Add(new Num(1), new Num(2))), 3);
checkEq(eval(new Mul(new Num(3), new Num(4))), 12);
checkEq(eval(new Neg(new Num(5))), -5);

checkEq(eval(new Add(new Num(1), new Mul(new Num(2), new Num(3)))), 7);
checkEq(eval(new Mul(new Add(new Num(1), new Num(2)), new Num(3))), 9);
checkEq(eval(new Neg(new Add(new Num(2), new Num(3)))), -5);
checkEq(eval(new Add(new Neg(new Num(4)), new Num(10))), 6);

checkEq(eval(new Num(0)), 0);
checkEq(eval(new Mul(new Num(0), new Num(99))), 0);
```

## Hints
- `case Num(int v) -> v;` matches and binds in one step.
- `Add` and `Mul` hold `Expr` components, so their arms call `eval` again on
  each side. The recursion is what handles nesting.
- Four cases, no `default`. If you find yourself wanting one, a case is
  missing.

## Solution
```java
sealed interface Expr permits Num, Add, Mul, Neg { }

record Num(int value) implements Expr { }
record Add(Expr left, Expr right) implements Expr { }
record Mul(Expr left, Expr right) implements Expr { }
record Neg(Expr operand) implements Expr { }

static int eval(Expr e) {
    return switch (e) {
        case Num(int v) -> v;
        case Add(Expr l, Expr r) -> eval(l) + eval(r);
        case Mul(Expr l, Expr r) -> eval(l) * eval(r);
        case Neg(Expr operand) -> -eval(operand);
    };
}
```

## Notes
This is the shape the chapter argued sealed types are for. `eval` is an
*operation over* expressions, not a property *of* them — and there will be more
of them: a printer, a simplifier, a type checker, a compiler to bytecode. Each
is a new method next to this one, and the four records never change.

Written the other way, with an `eval()` method on `Expr`, adding the printer
means editing all four records, and every future operation drags another
dependency into the data types.

The base case is `Num`, and the recursion terminates because every other case
strictly shrinks the tree — the same requirement chapter 1.4 set for
`digitSum`. Depth here is the depth of the expression rather than its size,
which is why recursion is safe: a stack overflow would need an expression
nested tens of thousands deep.

Two details of the pattern syntax are worth naming. `case Num(int v)` binds the
component by its *type*, not its name, so the name in the pattern is yours to
choose — `v` here, though the record calls it `value`. And `case Add(Expr l,
Expr r)` could equally be written `case Add a -> eval(a.left()) +
eval(a.right())`; the pattern form is shorter and, more usefully, makes the
arity visible, so adding a component to `Add` breaks this arm rather than
silently leaving it half-handled.
