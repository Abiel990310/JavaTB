---
id: default-method-audit
title: "Resolve the collision"
difficulty: core
chapter: interfaces
topics: [interfaces, default methods]
check: unit
standard: java21
---

Two interfaces each supply a `describe()` default, and a class needs both.

- `Timestamped` describes itself as `at <time>`
- `Tagged` describes itself as `#<tag>`
- `Event` implements both, and its `describe()` must return them joined by a
  space: `at 10:30 #urgent`

It must reuse both inherited defaults rather than reimplementing either. If you
find yourself repeating the `"at "` or the `"#"`, you have written the answer
the long way.

The starter does not compile.

## Starter
```java
interface Timestamped {
    String time();

    default String describe() {
        return "at " + time();
    }
}

interface Tagged {
    String tag();

    default String describe() {
        return "#" + tag();
    }
}

static class Event implements Timestamped, Tagged {
    private final String time;
    private final String tag;

    Event(String time, String tag) {
        this.time = time;
        this.tag = tag;
    }

    @Override
    public String time() {
        return time;
    }

    @Override
    public String tag() {
        return tag;
    }
}
```

## Tests
```java
Event e = new Event("10:30", "urgent");
checkEq(e.describe(), "at 10:30 #urgent");

Timestamped asTimestamped = e;
checkEq(asTimestamped.describe(), "at 10:30 #urgent");

Tagged asTagged = e;
checkEq(asTagged.describe(), "at 10:30 #urgent");

Event other = new Event("23:59", "later");
checkEq(other.describe(), "at 23:59 #later");
```

## Hints
- The compile error names the problem: the class inherits unrelated defaults
  for `describe()` from both interfaces.
- Java will not pick one for you. Override `describe()` in `Event`.
- Inside the override, `Timestamped.super.describe()` calls that interface's
  default specifically.

## Solution
```java
interface Timestamped {
    String time();

    default String describe() {
        return "at " + time();
    }
}

interface Tagged {
    String tag();

    default String describe() {
        return "#" + tag();
    }
}

static class Event implements Timestamped, Tagged {
    private final String time;
    private final String tag;

    Event(String time, String tag) {
        this.time = time;
        this.tag = tag;
    }

    @Override
    public String time() {
        return time;
    }

    @Override
    public String tag() {
        return tag;
    }

    @Override
    public String describe() {
        return Timestamped.super.describe() + " " + Tagged.super.describe();
    }
}
```

## Notes
`Timestamped.super.describe()` is the only place in Java where `super` takes a
qualifier, and it exists solely for this situation. It names which inherited
default you want, and it is available only inside a class that directly
implements that interface — you cannot reach two levels up with it.

Java refusing to choose is the right call. The two obvious automatic rules are
both bad: picking the first interface listed makes the meaning of a class
depend on the order of words in its declaration, and merging them is
meaningless for a method returning a single value. An error that the author
must resolve is the only option that cannot silently do the wrong thing — the
same reasoning as the exhaustiveness requirement on switch expressions in
chapter 1.3.

The three checks calling `describe()` through `Event`, `Timestamped` and
`Tagged` all expect the same answer, and that is the point: an override
replaces the default for every view of the object. There is no way to see the
inherited version from outside, which is what makes overriding a safe way to
resolve the conflict rather than a partial one.

Note also that this problem could not arise with abstract classes, because a
class has only one parent. The conflict is the price of letting a type take on
several roles, and it is a price worth paying — but it is why default methods
were designed as a compatibility mechanism rather than as a general way to
share code.
