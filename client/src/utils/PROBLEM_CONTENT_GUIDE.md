Here's the complete markdown file. Save it as `PROBLEM_CONTENT_GUIDE.md` in your project root:

```markdown
# ProbSolver — Problem Content Generation Guide

This file tells you exactly how to generate content for new problems
added to the ProbSolver platform. Give this file to any AI assistant
along with a problem title and link — it will generate all four
sections in the correct format instantly.

---

## What You Need to Provide

- **Problem Title** — exact name of the problem
- **Problem Link** — URL to the original problem (LeetCode, GFG, etc.)

That's it. The AI will generate everything else.

---

## What Needs to Be Generated

Every problem requires four sections to be filled:

1. Real World Context
2. Use Cases
3. Admin Notes
4. Follow-up Questions

---

## Section Formats

---

### 1. Real World Context

**Purpose:** Show where this algorithm pattern appears in real production software.
Helps members understand WHY this pattern matters beyond just interview prep.

**Format rules:**
- Start with one sentence explaining what pattern this problem teaches
- Then 4–6 bullet points each showing a specific real-world system that uses this pattern
- Each bullet: system name first, then what it uses the pattern for
- Keep each bullet to one line — no long paragraphs
- Use plain language — no jargon

**Template:**
```
This problem teaches [PATTERN NAME] — [one line on why it matters in software].

• [System 1] — [what it uses this pattern for]
• [System 2] — [what it uses this pattern for]
• [System 3] — [what it uses this pattern for]
• [System 4] — [what it uses this pattern for]
• [System 5] — [what it uses this pattern for]
```

**Example (Longest Common Prefix):**
```
This problem teaches prefix matching — a pattern used everywhere strings
need to be compared or compressed efficiently.

• Search engines — power autocomplete by finding the shared prefix
  among all matching suggestions to rank and display results
• Database B-Tree indexes — use longest prefix matching to navigate
  index trees efficiently during key lookups
• DNS resolution — hierarchical prefix matching routes each query
  through the right nameserver at each dot-separated level
• Terminal shells — tab completion finds the longest common prefix
  among all matching commands or filenames
• IP routing tables — longest prefix match selects the most specific
  network route for each packet
```

---

### 2. Use Cases

**Purpose:** Specific, concrete use cases members can reference
when writing their "Real World Connection" in their solution submission.

**Format rules:**
- 5–7 use cases total
- Each use case on its own line
- Format: `[System/Context] — [specific application of the pattern]`
- Be specific — not just "databases" but "Database B-Tree indexes"
- Vary the domains — mix tech companies, infrastructure, tools

**Template:**
```
[Specific system] — [specific application]
[Specific system] — [specific application]
[Specific system] — [specific application]
[Specific system] — [specific application]
[Specific system] — [specific application]
```

**Example (Longest Common Prefix):**
```
Autocomplete engines — Google Search, VS Code file finder, terminal tab completion
Database B-Tree indexes — longest prefix match for efficient key navigation
DNS resolution — hierarchical prefix matching across nameserver levels
IP routing tables — longest prefix match to select the most specific route
File path compression — finding shared directory prefixes to save storage
Git branch search — finding common prefix among branch names for filtering
```

---

### 3. Admin Notes

**Purpose:** Teaching guide for the admin who reviews solutions.
Covers all approaches, complexities, and edge cases to watch for.
Only visible to admins — write freely and technically.

**Format rules:**
- List all viable approaches in order from brute force to optimal
- For each approach: name, one-line description, time and space complexity
- Separate section for edge cases — list each as a bullet
- End with the "best teaching moment" — the key insight to push members on
- Use numbered lists for approaches, bullet points for edge cases

**Template:**
```
Approaches to cover in order:

1. [Approach Name]
   → [One line description of the approach]
   → Time: [complexity] | Space: [complexity]

2. [Approach Name]
   → [One line description of the approach]
   → Time: [complexity] | Space: [complexity]

3. [Approach Name] (if applicable)
   → [One line description of the approach]
   → Time: [complexity] | Space: [complexity]

Edge cases to push members on:
• [Edge case 1] → expected output
• [Edge case 2] → expected output
• [Edge case 3] → expected output
• [Edge case 4] → expected output

Best teaching moment: [The single most important insight for this problem]
```

**Example (Longest Common Prefix):**
```
Approaches to cover in order:

1. Horizontal scan
   → Start with strs[0] as prefix, compare against each string,
     trim on mismatch
   → Time: O(S) where S = total characters | Space: O(1)

2. Vertical scan
   → Check character by character across all strings at index i,
     stop when any string mismatches or ends
   → Time: O(S) | Space: O(1)

3. Divide and conquer
   → Split array in half, find LCP of each half, merge result
   → Time: O(S) | Space: O(m·log n) for recursion stack

Edge cases to push members on:
• Empty input array → return ""
• Array with single string → return that string itself
• All strings identical → return the full string
• No common prefix → return ""
• One string is prefix of another e.g. ["flower","flow"] → "flow"

Best teaching moment: Ask WHY horizontal scan works — the prefix
can only shrink, never grow. This is the key invariant.
```

---

### 4. Follow-up Questions

**Purpose:** Deepen understanding beyond the base problem.
Members answer these when submitting their solution.
Good follow-ups push towards harder variants, real-world extensions,
or trade-off analysis.

**Format rules:**
- Always generate exactly 3 follow-up questions
- Difficulty progression: EASY → MEDIUM → HARD
- Each follow-up needs: Question, Difficulty, Hint
- Question: one clear sentence, no ambiguity
- Hint: 1–2 sentences, nudge in the right direction without giving away the answer
- Do NOT make the hint too obvious — it should point to the approach, not the solution

**Template:**

```
Follow-up 1
• Question:   [One clear question that extends the base problem]
• Difficulty: EASY
• Hint:       [1–2 sentences nudging toward the approach]

Follow-up 2
• Question:   [A harder variant or real-world extension]
• Difficulty: MEDIUM
• Hint:       [1–2 sentences nudging toward the approach]

Follow-up 3
• Question:   [Advanced variant, trade-off analysis, or system design extension]
• Difficulty: HARD
• Hint:       [1–2 sentences nudging toward the approach]
```

**Example (Longest Common Prefix):**
```
Follow-up 1
• Question:   What if the input array is sorted lexicographically —
              can you solve it in O(m) time instead of O(m·n)?
• Difficulty: EASY
• Hint:       In a sorted array only compare the first and last string.
              If they share a prefix, every string in between must too —
              they are bounded by those two extremes.

Follow-up 2
• Question:   What if strings arrive as a stream one at a time — how
              do you maintain the longest common prefix efficiently?
• Difficulty: MEDIUM
• Hint:       Keep a running LCP variable initialized to the first string.
              For each new string update it using horizontal scan.
              The running LCP can only shrink or stay the same.

Follow-up 3
• Question:   How would you build a full autocomplete system using a Trie?
              What are the time and space trade-offs vs the prefix scan approach?
• Difficulty: HARD
• Hint:       Insert all strings into a Trie and traverse from the root —
              the LCP ends at the first node with more than one child or
              a word-end marker. Trie gives O(m) lookup but costs
              O(m·n) space upfront.
```

---

## Complete Example Output

Here is what the final output looks like for one problem,
ready to copy-paste into the ProbSolver admin panel:

---

### Problem: Longest Common Prefix
### Link: https://leetcode.com/problems/longest-common-prefix/

**Real World Context:**
```
This problem teaches prefix matching — a pattern used everywhere strings
need to be compared or compressed efficiently.

• Search engines — power autocomplete by finding the shared prefix
  among all matching suggestions to rank and display results
• Database B-Tree indexes — use longest prefix matching to navigate
  index trees efficiently during key lookups
• DNS resolution — hierarchical prefix matching routes each query
  through the right nameserver at each dot-separated level
• Terminal shells — tab completion finds the longest common prefix
  among all matching commands or filenames
• IP routing tables — longest prefix match selects the most specific
  network route for each packet
```

**Use Cases:**
```
Autocomplete engines — Google Search, VS Code file finder, terminal tab completion
Database B-Tree indexes — longest prefix match for efficient key navigation
DNS resolution — hierarchical prefix matching across nameserver levels
IP routing tables — longest prefix match to select the most specific route
File path compression — finding shared directory prefixes to save storage
Git branch search — finding common prefix among branch names for filtering
```

**Admin Notes:**
```
Approaches to cover in order:

1. Horizontal scan
   → Start with strs[0] as prefix, compare against each string,
     trim on mismatch
   → Time: O(S) where S = total characters | Space: O(1)

2. Vertical scan
   → Check character by character across all strings at index i,
     stop when any string mismatches or ends
   → Time: O(S) | Space: O(1)

3. Divide and conquer
   → Split array in half, find LCP of each half, merge result
   → Time: O(S) | Space: O(m·log n) for recursion stack

Edge cases to push members on:
• Empty input array → return ""
• Array with single string → return that string itself
• All strings identical → return the full string
• No common prefix → return ""
• One string is prefix of another e.g. ["flower","flow"] → "flow"

Best teaching moment: Ask WHY horizontal scan works — the prefix
can only shrink, never grow. This is the key invariant.
```

**Follow-up Questions:**
```
Follow-up 1
• Question:   What if the input array is sorted lexicographically —
              can you solve it in O(m) time instead of O(m·n)?
• Difficulty: EASY
• Hint:       In a sorted array only compare the first and last string.
              If they share a prefix, every string in between must too.

Follow-up 2
• Question:   What if strings arrive as a stream one at a time — how
              do you maintain the longest common prefix efficiently?
• Difficulty: MEDIUM
• Hint:       Keep a running LCP variable initialized to the first string.
              For each new string update it using horizontal scan.

Follow-up 3
• Question:   How would you build a full autocomplete system using a Trie?
              What are the time and space trade-offs vs prefix scan?
• Difficulty: HARD
• Hint:       Insert all strings into a Trie and traverse from the root —
              the LCP ends at the first node with more than one child
              or a word-end marker.
```

---

## How to Use This File

1. Open a new chat with any AI assistant
2. Paste this entire file
3. Say: "Generate content for this problem: [TITLE] — [LINK]"
4. The AI will generate all four sections in the correct format
5. Copy each section into the ProbSolver admin panel

---

## Quick Reference — Field Lengths

| Section | Recommended Length |
|---|---|
| Real World Context | 1 intro sentence + 4–6 bullets |
| Use Cases | 5–7 items |
| Admin Notes | 3 approaches + 4–6 edge cases + 1 teaching moment |
| Follow-up Questions | Exactly 3 — EASY, MEDIUM, HARD |

---

## Platform Details

- **App:** ProbSolver — Team Interview Intelligence Platform
- **Admin panel:** /admin → Add Problem
- **Who fills this:** Admin only (members cannot add problems)
- **Who sees Admin Notes:** Admin only
- **Who sees Follow-ups:** All members when submitting solutions
- **Supported sources:** LeetCode, GFG, CodeChef, InterviewBit, HackerRank, Codeforces
- **Supported difficulties:** EASY, MEDIUM, HARD
- **Follow-up difficulties:** EASY, MEDIUM, HARD
```

---

Save this as `PROBLEM_CONTENT_GUIDE.md` in your project root:

```bash
cd ~/Downloads/Projects/problem-solver
# Create the file, paste the content above, then:
git add PROBLEM_CONTENT_GUIDE.md
git commit -m "docs: add problem content generation guide"
git push
```

Now whenever you need content for a new problem, open a fresh chat, paste this file, and say:

```
Generate content for: Two Sum — https://leetcode.com/problems/two-sum/
```

It will output all four sections in the exact format ready to copy-paste into the admin panel!










Here is the rephrased system context you can paste at the start of any chat:

---

**PROJECT CONTEXT — ProbSolver (Read this fully before responding to anything)**

We are building **ProbSolver** — a single, comprehensive platform to help engineers crack any technical interview. This is a production application, not a side project or prototype.

**1. Production Grade — No Exceptions**

Every piece of code, every architecture decision, every UI component must be production-ready. This means proper error handling, edge case coverage, input validation, security considerations, performance optimization, and clean maintainable code. No patches, no shortcuts, no "we'll fix this later" solutions. If something is worth building, it is worth building correctly the first time.

**2. Scientific Accuracy in All Data, Analytics and Scoring**

Every metric, score, stat, percentage, chart, leaderboard calculation, readiness score, or progress indicator must be grounded in correct methodology. No arbitrary numbers, no vanity metrics, no made-up weights. If we compute a score, there must be a defensible, explainable formula behind it. If we show a trend, it must be statistically meaningful. Data must be honest even when the result is unflattering to the user.

**3. Human Psychology and Behavioral Science Must Drive All Evaluation**

When we build reports, debriefs, scoring systems, or feedback for interviews, quizzes, problem-solving sessions, or any performance-based activity, the evaluation must be rooted in how humans actually think, learn, perform under pressure, and retain knowledge. This includes but is not limited to:

- **Cognitive load theory** — how much mental effort a task demands and whether the candidate managed it
- **Behavioral signals** — what a person's actions (not just their answers) reveal about their thinking process, e.g. did they clarify requirements, think out loud, self-correct, handle ambiguity
- **Stress and pressure response** — how performance degrades or holds under timed, high-stakes conditions
- **Metacognition** — does the candidate know what they know and what they don't
- **Spaced repetition and memory science** — retention curves, forgetting rates, confidence calibration
- **Communication psychology** — clarity, structure, ownership language, specificity of examples
- **Growth indicators** — trajectory over time matters as much as a single performance snapshot

AI-generated analysis must synthesize these dimensions into honest, specific, actionable feedback — never generic, never hallucinated, always anchored to what actually happened in the session. A debrief must read like it was written by a world-class senior interviewer who was in the room, not like a report template that was filled in.

---

You can paste this at the top of any new chat and the context will be fully understood.