---
id: defend-the-inventory
title: "Shut both doors"
difficulty: core
chapter: aliasing
topics: [encapsulation, arrays, references]
check: unit
standard: java21
---

The `Inventory` class below is supposed to own its list of item names. It does
not: a caller can change its contents without calling any of its methods.

Fix it so that neither of the two escape routes works, without changing the
constructor's signature or the getter's return type. `size()` and `first()`
must keep working.

## Starter
```java
static class Inventory {
    private final String[] items;

    Inventory(String[] items) {
        this.items = items;
    }

    String[] getItems() {
        return items;
    }

    int size() {
        return items.length;
    }

    String first() {
        return items[0];
    }
}
```

## Tests
```java
String[] source = { "rope", "lantern" };
Inventory inv = new Inventory(source);

source[0] = "tampered";
checkEq(inv.first(), "rope");

inv.getItems()[1] = "tampered";
checkEq(inv.getItems()[1], "lantern");

checkEq(inv.size(), 2);
checkEq(inv.getItems().length, 2);

String[] handedOut = inv.getItems();
String[] handedOutAgain = inv.getItems();
check(handedOut != handedOutAgain);
```

## Hints
- Two checks fail, and they correspond to two different lines of the class.
- The constructor is storing the caller's array. Store something else.
- The getter is returning the object's own array. Return something else.
- `clone()` on an array gives you an independent copy of it.

## Solution
```java
static class Inventory {
    private final String[] items;

    Inventory(String[] items) {
        this.items = items.clone();
    }

    String[] getItems() {
        return items.clone();
    }

    int size() {
        return items.length;
    }

    String first() {
        return items[0];
    }
}
```

## Notes
Two `clone()` calls, one per door. The constructor takes a snapshot so the
caller's later edits cannot reach in; the getter hands out a snapshot so the
caller's edits have nowhere to land.

The last check is the one that would catch a half-fix. Copying only in the
constructor passes the first two checks in most casual testing, because the
getter's damage is not visible until someone writes through it. Asserting that
two calls to `getItems()` return *different objects* pins down that the getter
copies, independently of whether anyone has mutated anything yet.

`size()` and `first()` keep using the field directly, and should. They read
without exposing, which is the cheapest kind of safety — no copy is made
because no reference leaves. A class with enough of these methods often needs
no array getter at all, and the version with no getter is stronger than the
version with a careful one.

The cost is real and worth naming: every call to `getItems()` now allocates and
copies. For two items that is nothing; for a million-element array called in a
loop it is the dominant cost of the program. When that matters, the answer is
usually not to remove the copy but to stop handing out the array — expose the
operation the caller wanted instead.
