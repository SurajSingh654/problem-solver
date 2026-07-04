# Low Level Design

**Language:** Java
**Baseline:** starting from OOP fundamentals
**Goal:** interview-weighted, but covers real-world trade-offs and depth
**Estimated time:** ~18-25 hours across 11 modules + capstone

---

**Module 01 · OOP for LLD — the four pillars + composition over inheritance**
Encapsulation, abstraction, inheritance, polymorphism — with Java code showing what "correct OOP" looks like in an interview vs bad OOP smells. Plus the informal fifth pillar — **composition over inheritance** — the most common LLD interview follow-up and the single design habit that prevents the most damage in real codebases. Lays the foundation without which SOLID and patterns don't stick.

**Module 02 · SOLID principles**
Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion — each with a Java before/after refactoring. The five ideas every LLD interview implicitly grades you on.

**Module 03 · Machine-coding methodology + UML sketching**
How to attack any LLD problem in 60-90 minutes: clarify requirements → identify entities → sketch class diagram → write APIs → implement → **write basic tests as part of the submission** → walk the interviewer through. UML class-diagram notation. What interviewers actually look for (hint: candidates who ship tests stand out immediately).

**Module 04 · Creational patterns**
Singleton, Factory Method, Builder — the interview-critical three, with Java examples. Brief coverage of Abstract Factory + Prototype. When each helps and when each hurts.

**Module 05 · Structural patterns**
Adapter, Decorator, Facade — the interview-critical three, with Java examples. Brief coverage of Composite + Proxy. Distinguishing patterns that look similar on paper.

**Module 06 · Behavioural patterns — Part 1**
Strategy, Observer, State — the three that appear in almost every machine-coding round. Why `if/else on type` is a Strategy in disguise.

**Module 07 · Behavioural patterns — Part 2**
Command, Template Method, Chain of Responsibility — the next tier. Real Spring / Servlet API examples so patterns stop feeling abstract.

**Module 08 · Concurrency for LLD**
Thread safety, atomic operations, `ConcurrentHashMap` vs `synchronized`, `ReentrantLock`, common race conditions. The concurrency follow-ups that show up after every machine-coding problem.

**Module 09 · Classic problem: Parking Lot end-to-end**
The "hello world" of LLD interviews. Walk from ambiguous requirements to full Java implementation with tests. What excellence looks like, and how interviewers grade it.

**Module 10 · Classic problem: Splitwise or LRU Cache**
Different domain, different patterns. Pick whichever interests you more; both taught with the same rigour. Practice applying methodology under time pressure.

**Module 11 · Refactoring, code smells, when NOT to use patterns**
Recognising bad designs, safe refactoring paths, over-engineering, YAGNI. The senior-engineer skill that separates "I know patterns" from "I know when patterns hurt".

**Capstone · Timed machine-coding build**
Choose one: restaurant booking, rate limiter, URL shortener, cab booking, in-memory pub/sub. Full Java implementation with tests, README, and a machine-coding-format walkthrough as if you were submitting to an interviewer.
