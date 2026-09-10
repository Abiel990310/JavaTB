---
id: polymorphic-payroll
title: "One loop, three kinds of staff"
difficulty: core
chapter: polymorphism
topics: [polymorphism, inheritance]
check: unit
standard: java21
---

Three kinds of employee are paid differently. Write them so that a single loop
over an `Employee[]` can total the payroll without knowing which is which.

- `Salaried(long annualPence)` — monthly pay is the annual figure divided by 12,
  rounded down.
- `Hourly(long ratePence, int hours)` — pay is rate × hours.
- `Contractor(long invoicePence)` — pay is whatever was invoiced.

Every one of them must answer `monthlyPay()`, and `totalPayroll` must work
without a single `instanceof` or cast.

The starter's `Hourly` looks finished and is not.

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

    long monthlyPay(int unused) {
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

## Tests
```java
Employee[] staff = {
    new Salaried("Ada", 60_000_00L),
    new Hourly("Grace", 25_00L, 160),
    new Contractor("Alan", 4_000_00L),
};

checkEq(staff[0].monthlyPay(), 500_000L);
checkEq(staff[1].monthlyPay(), 400_000L);
checkEq(staff[2].monthlyPay(), 400_000L);
checkEq(totalPayroll(staff), 1_300_000L);

checkEq(new Salaried("x", 100_00L).monthlyPay(), 833L);
checkEq(new Hourly("y", 10_00L, 0).monthlyPay(), 0L);
checkEq(totalPayroll(new Employee[] { }), 0L);

Employee viewedAsEmployee = new Hourly("z", 1000L, 3);
checkEq(viewedAsEmployee.monthlyPay(), 3000L);
```

## Hints
- `Contractor` does not exist yet. Write it.
- `Hourly.monthlyPay(int unused)` takes a parameter, so it is a different
  method from the one `totalPayroll` calls — an overload, not an override.
- Put `@Override` on every method you mean as an override and the compiler will
  find that for you.

## Solution
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

    @Override
    long monthlyPay() {
        return ratePence * hours;
    }
}

static class Contractor extends Employee {
    private final long invoicePence;

    Contractor(String name, long invoicePence) {
        super(name);
        this.invoicePence = invoicePence;
    }

    @Override
    long monthlyPay() {
        return invoicePence;
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
`long monthlyPay(int unused)` is the overload trap from chapter 2.4 wearing
different clothes. It compiles, it looks like the method it is meant to be, and
`totalPayroll` never calls it — dispatch looks for the no-argument
`monthlyPay()`, finds only the one inherited from `Employee`, and every hourly
worker is paid nothing. `@Override` turns that into a compile error, which is
why it belongs on every override without exception.

The point of the exercise is what `totalPayroll` does *not* contain. It has no
`instanceof`, no cast, and no knowledge that `Contractor` exists — and adding
`Contractor` required no change to it at all. That is the property worth
protecting: the loop is closed to modification and the hierarchy is open to
extension.

`Employee.monthlyPay()` returning 0 is a placeholder that a real design would
question. An `Employee` that is none of the three kinds should probably not be
constructible at all, which is what `abstract` in chapter 2.8 is for — it lets
the parent declare the method without answering it, and makes the compiler
insist that every concrete subclass does.
