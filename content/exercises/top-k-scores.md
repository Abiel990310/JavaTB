---
id: top-k-scores
title: "Keep only the best k"
difficulty: stretch
chapter: queues-and-deques
topics: [PriorityQueue, heaps]
check: unit
standard: java21
---

Write `topK(List<Integer> scores, int k)` returning the `k` largest scores, in
descending order.

If there are fewer than `k` scores, return all of them, still descending. A `k`
of zero gives an empty list. Duplicates count separately: the top 2 of
`[5, 5, 3]` is `[5, 5]`.

Do it with a `PriorityQueue` holding at most `k` elements at a time, rather
than sorting everything. That is the point of the exercise: for a million
scores and a top ten, sorting does a million-log-million comparisons to answer
a question that needs a million-log-ten.

## Starter
```java
static List<Integer> topK(List<Integer> scores, int k) {
    PriorityQueue<Integer> best = new PriorityQueue<>(Comparator.reverseOrder());
    best.addAll(scores);
    return new ArrayList<>(best).subList(0, Math.min(k, best.size()));
}
```

## Tests
```java
checkEq(topK(List.of(3, 1, 4, 1, 5, 9, 2, 6), 3), List.of(9, 6, 5));
checkEq(topK(List.of(5, 5, 3), 2), List.of(5, 5));
checkEq(topK(List.of(1, 2, 3), 5), List.of(3, 2, 1));
checkEq(topK(List.of(1, 2, 3), 0), List.of());
checkEq(topK(List.of(), 3), List.of());
checkEq(topK(List.of(7), 1), List.of(7));
checkEq(topK(List.of(-5, -1, -3), 2), List.of(-1, -3));

List<Integer> many = new ArrayList<>();
for (int i = 0; i < 200_000; i++) {
    many.add(i);
}
checkEq(topK(many, 3), List.of(199_999, 199_998, 199_997));
```

## Hints
- The starter copies the queue into a list, which gives heap order rather than
  sorted order — the chapter's main point.
- Turn the idea round: keep a **minimum**-heap of size `k`. The smallest of the
  best-so-far sits on top, ready to be evicted.
- For each score: add it, and if the queue is now larger than `k`, poll once to
  drop the smallest.
- At the end, drain the queue — that gives ascending order, so reverse it.

## Solution
```java
static List<Integer> topK(List<Integer> scores, int k) {
    if (k <= 0) {
        return List.of();
    }
    PriorityQueue<Integer> best = new PriorityQueue<>();   // smallest on top
    for (int score : scores) {
        best.offer(score);
        if (best.size() > k) {
            best.poll();                                   // drop the smallest
        }
    }
    List<Integer> result = new ArrayList<>();
    while (!best.isEmpty()) {
        result.add(best.poll());                           // ascending
    }
    Collections.reverse(result);
    return result;
}
```

## Notes
The starter is wrong for the reason the chapter spends its length on:
`new ArrayList<>(best)` walks the heap's backing array, so it gets heap order,
not sorted order. Position 0 is correct and the rest is arbitrary — which means
the first check might even pass for `k = 1` and fail for every larger `k`. That
is the worst shape of bug: right often enough to look right.

The working version inverts the intuition. To keep the *largest* k, hold a
**minimum**-heap: the weakest of the current best sits at the top where it is
cheap to find and cheap to evict. Every new score costs O(log k), and the heap
never grows beyond k.

That is why the two-hundred-thousand-element check is here. Sorting the whole
list to take three elements is O(n log n) and finishes easily at this size, so
the check does not enforce the complexity — but the difference is real at scale
and is the reason the technique is worth knowing. It is the standard answer to
"top k of a stream too large to hold", where sorting is not an option at all.

Draining gives ascending order because polling a min-heap yields the smallest
first, hence the `Collections.reverse`. The alternative — a max-heap of
everything, polled k times — is simpler to write and O(n + k log n), which is
better when k approaches n and much worse when it does not.

`k <= 0` is handled before the loop rather than relying on the arithmetic. With
`k = 0` the loop would add and immediately evict every element, doing 2n heap
operations to produce nothing.
