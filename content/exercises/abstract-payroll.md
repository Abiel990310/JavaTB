---
id: abstract-payroll
title: "Make the placeholder impossible"
difficulty: core
chapter: abstract-classes
topics: [abstract, inheritance]
check: unit
standard: java21
---

The payroll from chapter 2.6 had a weakness: `Employee.monthlyPay()` returned
`0`, so a subclass that failed to override it was paid nothing and nothing
complained.

Rewrite it so that failure is impossible:

- `Employee` is **abstract**, holds the name, and declares `monthlyPay()`
  abstract.
- `Salaried(name, annualPence)` pays the annual figure divided by 12, rounded
  down.
- `Hourly(name, ratePence, hours)` pays rate × hours.
- `totalPayroll(Employee[])` sums them, with no `instanceof` and no cast.

The starter still has a concrete `Employee` returning zero. Removing that
placeholder is the exercise.

## Starter
```java
static class Employee {
    private final String name;

    Employee(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    long monthlyPay() {
        return 0;
    }
}

static class Salaried extends Employee {
    private final long annualPence;

    Salaried(String name, long annualPence) {
        super(name);
        this.annualPence = annualPence;
    }

    @Override
    long monthlyPay() {
        return annualPence / 12;
    }
}

static class Hourly extends Employee {
    private final long ratePence;
    private final int hours;

    Hourly(String name, long ratePence, int hours) {
        super(name);
        this.ratePence = ratePence;
        this.hours = hours;
    }
}

static long totalPayroll(Employee[] staff) {
    long total = 0;
    for (Employee e : staff) {
        total += e.monthlyPay();
    }
    return total;
}
```

## Tests
```java
Employee[] staff = { new Salaried("Ada", 60_000_00L), new Hourly("Grace", 25_00L, 160) };

checkEq(staff[0].monthlyPay(), 500_000L);
checkEq(staff[1].monthlyPay(), 400_000L);
checkEq(totalPayroll(staff), 900_000L);
checkEq(staff[0].name(), "Ada");
checkEq(totalPayroll(new Employee[] { }), 0L);

checkEq(new Hourly("z", 1000L, 0).monthlyPay(), 0L);
checkEq(new Salaried("y", 11L).monthlyPay(), 0L);
```

## Hints
- `Hourly` never implements `monthlyPay()`, so it currently inherits the
  placeholder and pays nothing.
- Mark `Employee` abstract and `monthlyPay()` abstract, with a semicolon in
  place of the body.
- The compiler will then refuse to compile `Hourly` until you write the
  method — which is the entire point.

## Solution
```java
abstract static class Employee {
    private final String name;

    Employee(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    abstract long monthlyPay();
}

static class Salaried extends Employee {
    private final long annualPence;

    Salaried(String name, long annualPence) {
        super(name);
        this.annualPence = annualPence;
    }

    @Override
    long monthlyPay() {
        return annualPence / 12;
    }
}

static class Hourly extends Employee {
    private final long ratePence;
    private final int hours;

    Hourly(String name, long ratePence, int hours) {
        super(name);
        this.ratePence = ratePence;
        this.hours = hours;
    }

    @Override
    long monthlyPay() {
        return ratePence * hours;
    }
}

static long totalPayroll(Employee[] staff) {
    long total = 0;
    for (Employee e : staff) {
        total += e.monthlyPay();
    }
    return total;
}
```

## Notes
Compare the two failure modes. With a concrete `Employee` returning `0`, a
missing override is a payroll that quietly underpays somebody — discovered by
a person, eventually, in anger. With `Employee` abstract, it is *Hourly is not
abstract and does not override abstract method monthlyPay()*, at compile time,
naming the class and the method.

That is the argument for abstract in one sentence: it converts a runtime
wrong-answer into a compile error, and it costs nothing.

Note that `Employee` keeps its constructor and its `name` field. Abstract does
not mean empty — it means incomplete. The class still owns everything common
to all employees, and `super(name)` in each subclass still runs. What it
cannot do is exist on its own, which is correct: there is no such thing as an
employee who is neither salaried, hourly nor contracted.

The check `new Salaried("y", 11L).monthlyPay()` expecting `0` is not a
placeholder creeping back in — it is 11 pence a year, which really is zero
pence a month once integer division truncates. Worth having, because it is the
one case where the correct answer and the broken answer agree, and a reader
who changes the rounding will see it fail.
