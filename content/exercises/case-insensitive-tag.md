---
id: case-insensitive-tag
title: "Equality that ignores case"
difficulty: core
chapter: equals-and-hashcode
topics: [equals, hashCode, contracts]
check: unit
standard: java21
---

Write a `Tag` class whose equality ignores case: `new Tag("Urgent")` and
`new Tag("urgent")` are equal. `name()` returns the text exactly as it was
given, preserving the original case.

The starter's `equals` already ignores case. Its `hashCode` does not, and a
`HashSet` of tags therefore behaves as though `equals` did not exist.

## Starter
```java
static final class Tag {
    private final String name;

    Tag(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Tag other && other.name.equalsIgnoreCase(name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name);
    }
}
```

## Tests
```java
Tag upper = new Tag("Urgent");
Tag lower = new Tag("urgent");
Tag other = new Tag("later");

check(upper.equals(lower));
check(!upper.equals(other));
checkEq(upper.name(), "Urgent");
checkEq(lower.name(), "urgent");

checkEq(upper.hashCode(), lower.hashCode());

Set<Tag> tags = new HashSet<>();
tags.add(upper);
check(tags.contains(lower));
tags.add(lower);
checkEq(tags.size(), 1);

Map<Tag, Integer> counts = new HashMap<>();
counts.put(upper, 1);
counts.put(lower, 2);
checkEq(counts.size(), 1);
checkEq(counts.get(new Tag("URGENT")), 2);
```

## Hints
- `equals` says the two tags are equal. What does the contract then require of
  their hash codes?
- `Objects.hash(name)` hashes the string as written, so `"Urgent"` and
  `"urgent"` hash differently.
- Hash the same thing `equals` compares — a case-normalised form of the name.
- `name()` must still return the original text, so normalise for hashing only.
  Do not normalise the field.

## Solution
```java
static final class Tag {
    private final String name;

    Tag(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof Tag other && other.name.equalsIgnoreCase(name);
    }

    @Override
    public int hashCode() {
        return name.toLowerCase(Locale.ROOT).hashCode();
    }
}
```

## Notes
The rule is one sentence: **hash whatever `equals` compares.** `equals` here
compares case-insensitively, so the hash must be computed from something that
is the same for `"Urgent"` and `"urgent"`.

`Locale.ROOT` is not decoration. `toLowerCase()` with no argument uses the
platform's default locale, and in Turkish the lowercase of `I` is `ı` — a
different character with a different hash. A program that agreed with itself in
London would then disagree with itself in Istanbul, and only for tags
containing the letter I. Any case conversion done for comparison rather than
for display should name the locale explicitly.

The map checks at the end are the ones that would catch a partial fix.
`counts.put(lower, 2)` must *replace* the entry keyed by `upper` rather than
adding a second one, which only happens when the two keys agree on both hash
and equality. And `counts.get(new Tag("URGENT"))` looks up with a third casing
that has never been stored, which works for exactly the same reason.

Note what has been given up. This `Tag` is equal to another tag with different
contents, so `equals` no longer implies interchangeability — two equal tags can
display differently. That is a legitimate design, and it is the same one
`String.CASE_INSENSITIVE_ORDER` and case-insensitive file systems make. It is
worth doing knowingly rather than by accident.
