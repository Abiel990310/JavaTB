---
title: "Wildcards"
navTitle: "Wildcards"
summary: >-
  Why a List of String is not a List of Object, and the two question marks that let a method accept more than one element type without giving up safety.
objectives:
  - Explain why generics are invariant and arrays are not
  - Choose between ? extends and ? super using PECS
  - Say what you may and may not do through each kind of wildcard
status: complete
standard: java21
requires: [erasure]
---

Chapter 1.5 showed that arrays are **covariant**: a `String[]` is an
`Object[]`, and the JVM pays for it with a check on every store, throwing
`ArrayStoreException` when the claim turns out to be false.

Generics made the opposite choice.

## Invariance

```java run expect-error title="A List of String is not a List of Object"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        List<Object> anything = names;

        anything.add(42);
        System.out.println(names.get(0).length());
    }
}
```

*incompatible types: List<String> cannot be converted to List<Object>.*

Look at the two lines after the assignment to see why the rule is right. If
that conversion were allowed, `anything.add(42)` would be legal — it is an
`Object` — and `names.get(0)` would then return an `Integer` where the compiler
had promised a `String`. Arrays allow exactly this and catch it at run time;
generics forbid it at compile time, which is strictly better, and possible
because erasure means there is no run-time check to fall back on anyway.

So `List<String>` and `List<Object>` are unrelated types. That is safe, and it
is also inconvenient: a method taking `List<Number>` cannot be passed a
`List<Integer>`, even to do nothing but read from it.

Wildcards are the way back.

## `? extends` — reading

```java run title="Accepting any list of some subtype"
import java.util.*;

public class Main {
    static double sum(List<? extends Number> numbers) {
        double total = 0;
        for (Number n : numbers) {          // every element is at least a Number
            total += n.doubleValue();
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(sum(List.of(1, 2, 3)));
        System.out.println(sum(List.of(1.5, 2.5)));
        System.out.println(sum(List.<Number>of(1, 2.5)));
    }
}
```

`List<? extends Number>` means "a list of some *specific* type that is a
`Number` — I do not know which". That is enough to read: whatever the element
type is, it is a `Number`, so every element can be treated as one.

It is not enough to write:

```java run expect-error title="You cannot add through ? extends"
import java.util.*;

public class Main {
    static void addOne(List<? extends Number> numbers) {
        numbers.add(1);
    }

    public static void main(String[] args) {
        addOne(new ArrayList<Integer>());
    }
}
```

*incompatible types: int cannot be converted to CAP#1.* That `CAP#1` is the
compiler's name for the unknown type — a *capture*. The list might be a
`List<Double>`, in which case adding an `Integer` would be wrong, and the
compiler cannot tell which it is.

The one value you may add is `null`, since it is a member of every reference
type.

## `? super` — writing

```java run title="Accepting any list that can hold this type"
import java.util.*;

public class Main {
    static void fillWithFirstThree(List<? super Integer> sink) {
        for (int i = 1; i <= 3; i++) {
            sink.add(i);                    // an Integer fits in all of them
        }
    }

    public static void main(String[] args) {
        List<Integer> integers = new ArrayList<>();
        List<Number> numbers = new ArrayList<>();
        List<Object> objects = new ArrayList<>();

        fillWithFirstThree(integers);
        fillWithFirstThree(numbers);
        fillWithFirstThree(objects);

        System.out.println(integers + " " + numbers + " " + objects);
    }
}
```

`List<? super Integer>` means "a list of `Integer` or of some supertype". You
can always add an `Integer`, because whatever the list's element type is, an
`Integer` is one.

Reading is the part you lose: the elements are of some unknown supertype, so
the most the compiler will promise is `Object`.

## PECS

The mnemonic is **Producer Extends, Consumer Super**:

- The parameter **produces** values for you to read → `? extends`
- The parameter **consumes** values you supply → `? super`
- It does both → no wildcard; use the exact type

```java run title="Both halves in one signature"
import java.util.*;

public class Main {
    static <T> void copy(List<? extends T> source, List<? super T> destination) {
        for (T item : source) {
            destination.add(item);
        }
    }

    public static void main(String[] args) {
        List<Integer> source = List.of(1, 2, 3);
        List<Number> destination = new ArrayList<>();

        copy(source, destination);
        System.out.println(destination);

        List<Object> anything = new ArrayList<>();
        copy(source, anything);
        System.out.println(anything);
    }
}
```

`source` produces, `destination` consumes, and the signature says so. Without
the wildcards this method would only ever copy a `List<T>` into another
`List<T>` — the same T on both sides — which is almost never the call you want
to make.

This is `Collections.copy`'s actual signature, and `Collections.max` takes
`Comparator<? super T>` for the same reason: a comparator that can order
`Object`s can certainly order your `T`s, so refusing it would be arbitrary.
Chapter 5.1's `bounded-max` used that already.

:::tip
The rule for your own APIs: **wildcards belong on parameters, not on return
types.** A method returning `List<? extends Number>` forces every caller to
deal with a wildcard they cannot do anything useful with. Return the concrete
type and accept the flexible one.
:::

## The unbounded wildcard

`List<?>` — "a list of something" — is what you write when the element type is
genuinely irrelevant:

```java run title="When you do not care at all"
import java.util.*;

public class Main {
    static int sizeOf(Collection<?> items) {
        return items.size();
    }

    static boolean sameSize(Collection<?> a, Collection<?> b) {
        return a.size() == b.size();
    }

    public static void main(String[] args) {
        System.out.println(sizeOf(List.of("a", "b")));
        System.out.println(sizeOf(Set.of(1, 2, 3)));
        System.out.println(sameSize(List.of("a"), Set.of(1)));
    }
}
```

`Collection<?>` is not the same as a raw `Collection`. The raw type turns
checking off; the wildcard keeps it on and simply says the element type is
unknown — so you can read elements as `Object` and add nothing but `null`,
which is exactly right for a method that only counts.

:::quiz
{
  "question": "A method needs to read `Number`s from a list and also add `Integer`s to it. What should the parameter type be?",
  "options": [
    { "text": "`List<Integer>` — no wildcard, because it both produces and consumes", "correct": true, "why": "Right. PECS covers the cases where a parameter does one or the other. Doing both means neither wildcard works — ? extends forbids adding, ? super forbids reading as anything but Object — so the exact type is required." },
    { "text": "`List<? extends Number>`, since Number is what it reads", "correct": false, "why": "That permits the reads and forbids every add except null. The compiler cannot know the list is not a List<Double>." },
    { "text": "`List<? super Integer>`, since Integer is what it adds", "correct": false, "why": "That permits the adds, but reading gives Object — the list might be a List<Object>, so nothing guarantees a Number comes back." },
    { "text": "`List<? extends Number & Integer>`", "correct": false, "why": "Multiple bounds are for type parameter declarations, not wildcards, and this would not compile. There is no wildcard form that allows both directions." }
  ]
}
:::

## Practice

:::exercise pecs-signatures

:::exercise flexible-transfer

:::recap
- Generics are invariant: `List<String>` is not a `List<Object>`, because
  allowing it would let a wrong element in and break a promise at the read.
  Arrays allow it and pay with a run-time check.
- `? extends T` produces: read as `T`, add nothing but `null`.
- `? super T` consumes: add a `T`, read only as `Object`.
- Producer Extends, Consumer Super. A parameter that does both takes the exact
  type.
- Wildcards belong on parameters, not return types.
- `Collection<?>` keeps type checking on and says the element type is unknown;
  a raw `Collection` turns it off.
:::
