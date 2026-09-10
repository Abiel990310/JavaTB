---
title: "Erasure"
navTitle: "Erasure"
summary: >-
  What the compiler does with your type arguments, what is left at run time, and the surprising amount that survives anyway.
objectives:
  - Say what a generic type looks like at run time and why
  - Explain heap pollution and the unchecked warning that precedes it
  - Predict which generic constructs the compiler will reject, and why
status: complete
standard: java21
requires: [generic-classes]
---

Generics were added in Java 5 to a language that already had a decade of
compiled code and libraries. The requirement was absolute: existing class files
had to keep working, and new generic code had to interoperate with old raw
code in both directions.

The solution was **erasure**. The compiler checks your type arguments, then
throws them away. `List<String>` and `List<Integer>` compile to the same class,
and at run time there is only `List`.

Everything strange about Java generics follows from that decision.

## One class at run time

```java run title="The type argument is gone"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();
        List<Integer> ages = new ArrayList<>();

        System.out.println("same class: " + (names.getClass() == ages.getClass()));
        System.out.println("which is:   " + names.getClass().getName());
    }
}
```

The compiler replaced `T` with `Object` — or with the bound, where there is one
— and inserted casts at every point where a value comes back out. Your code
never writes those casts; it just cannot avoid them either.

## Heap pollution

Because the check is entirely at compile time, defeating it puts a value of the
wrong type into a collection and nothing notices until someone reads it:

```java run title="A List<String> holding an Integer"
import java.util.*;

public class Main {
    @SuppressWarnings({ "unchecked", "rawtypes" })
    public static void main(String[] args) {
        List<String> names = new ArrayList<>();

        List raw = names;               // a raw reference to the same list
        raw.add(42);                    // no check happens here

        System.out.println("the list holds: " + names);

        try {
            String first = names.get(0);   // the compiler's inserted cast fails here
            System.out.println(first);
        } catch (ClassCastException e) {
            System.out.println("reading it: " + e.getMessage().split(" \\(")[0]);
        }
    }
}
```

This is **heap pollution**: a variable of a parameterised type referring to an
object that is not of that type. The exception surfaces at the read, in code
that did nothing wrong — chapter 5.1's pre-generics failure, reintroduced by
turning the checking off.

The compiler warns before it happens. An **unchecked** warning means "I cannot
prove this cast is safe, and I am not going to check it at run time either". It
is not noise; it is the compiler telling you exactly where erasure has left a
hole.

:::warning
`@SuppressWarnings("unchecked")` is sometimes genuinely necessary — writing a
generic container over an `Object[]`, for instance. Put it on the smallest
possible scope, never a whole class, and write a comment saying why the cast is
safe. If you cannot write that comment, it is not safe.
:::

## What the compiler therefore refuses

```java run expect-error title="Two methods, one signature"
import java.util.*;

public class Main {
    static void process(List<String> items) { }
    static void process(List<Integer> items) { }

    public static void main(String[] args) {
        process(new ArrayList<String>());
    }
}
```

*name clash: process(List<Integer>) and process(List<String>) have the same
erasure.* After erasure both are `process(List)`, and a class cannot have two
methods with the same signature.

```java run expect-error title="No type to test against"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Object value = new ArrayList<String>();

        if (value instanceof List<String>) {
            System.out.println("a list of strings");
        }
    }
}
```

*Object cannot be safely cast to List<String>.* At run time there is nothing to
test — the object knows it is an `ArrayList` and not what it contains. You may
write `value instanceof List<?>`, which asks the question that can actually be
answered.

Interestingly, `names instanceof List<String>` **is** allowed when `names` is
already declared `List<String>`, because then the compiler can prove it
statically. The rule is not "no generics in instanceof"; it is "only where no
run-time check is required".

```java run expect-error title="No type to construct or allocate"
public class Main {
    static <T> T create() {
        return new T();
    }

    public static void main(String[] args) {
        System.out.println(Main.<String>create());
    }
}
```

*unexpected type.* `new T()` needs a constructor to call and `T` does not exist
at run time. The same reasoning forbids `new T[n]` — *generic array creation* —
which chapter 5.4 returns to, since it is the most annoying of the
consequences.

To create instances of a type parameter you must be handed something that can:
a `Supplier<T>`, or a `Class<T>` to call `getDeclaredConstructor().newInstance()`
on. Passing the type explicitly is how the JDK does it, in
`Collection.toArray(T[])` and `EnumSet.noneOf(Class<E>)`.

## Erasure is not total

The name suggests everything is thrown away. It is not — the *signatures* are
kept as metadata, and reflection can read them:

```java run title="The type argument survives in the class file"
import java.util.*;
import java.lang.reflect.*;

public class Main {
    static List<String> names = new ArrayList<>();
    static Map<String, Integer> ages = new HashMap<>();

    public static void main(String[] args) throws Exception {
        Field namesField = Main.class.getDeclaredField("names");
        System.out.println("erased type:  " + namesField.getType().getSimpleName());
        System.out.println("generic type: " + namesField.getGenericType());
        System.out.println("map field:    " + Main.class.getDeclaredField("ages").getGenericType());
    }
}
```

What is erased is the *run-time check*, not the *record* of what you wrote.
Fields, method parameters, return types and superclass declarations all keep
their generic signature in the class file.

That is how frameworks work. Jackson knows to deserialise JSON into
`List<Person>` rather than `List<Object>` because the field's signature says
so; Spring resolves a `Repository<User, Long>` the same way. It is also the
basis of the "super type token" trick, where an anonymous subclass —
`new TypeReference<List<String>>() {}` — exists purely so that its *superclass
signature* records the type argument for reflection to read back.

So: an object does not know its type arguments. A field, method or class
declaration does.

:::quiz
{
  "question": "Why can't a class declare both `void add(List<String>)` and `void add(List<Integer>)`?",
  "options": [
    { "text": "After erasure both are `add(List)`, and a class cannot have two methods with the same signature", "correct": true, "why": "Right. The type arguments are removed before the class file is written, so the two would collide. The compiler reports it as a name clash naming the erasure explicitly." },
    { "text": "Java does not allow overloading on generic types at all", "correct": false, "why": "It does, where the erasures differ — add(List<String>) and add(Set<String>) is fine, because List and Set erase differently." },
    { "text": "The JVM could not choose between them at run time", "correct": false, "why": "Overload resolution happens entirely at compile time, as chapter 1.4 showed. The problem is earlier: the two methods cannot both exist in the class file." },
    { "text": "It is allowed, but the second one shadows the first", "correct": false, "why": "It is a compile error, and a specific one: name clash ... have the same erasure." }
  ]
}
:::

## Practice

:::exercise erasure-predictions

:::exercise safe-generic-container

:::recap
- The compiler checks type arguments and then removes them, replacing each type
  parameter with `Object` or its bound and inserting casts. `List<String>` and
  `List<Integer>` are one class at run time.
- Heap pollution is a parameterised variable pointing at an object of the wrong
  type; the failure appears at the read. An unchecked warning marks exactly
  where the compiler stopped being able to help.
- Erasure forbids overloads with the same erasure, `instanceof` against a
  parameterised type where a check would be needed, and `new T()` or `new T[n]`.
- To construct a `T`, be given a `Supplier<T>` or a `Class<T>`.
- Signatures are kept in the class file, so reflection can read a field's
  generic type. That is how frameworks bind JSON to `List<Person>`.
:::
