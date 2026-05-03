/**
 * CATEGORY FORM CONFIGURATIONS
 * Maps each problem category to its submission form structure.
 * Reuses existing Solution fields with different labels/placeholders.
 */
export const CATEGORY_FORMS = {
  CODING: {
    steps: [
      {
        id: 1,
        label: "Pattern",
        icon: "🧩",
        desc: "Identify the algorithm pattern",
      },
      {
        id: 2,
        label: "Solutions",
        icon: "💻",
        desc: "Your approaches with code and complexity",
      },
      {
        id: 3,
        label: "Reflection",
        icon: "🔬",
        desc: "Insights, explanations, and self-assessment",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Pattern Identified",
        placeholder:
          "e.g. Two Pointers, Sliding Window, Dynamic Programming...",
        show: true,
      },
      patternReasoning: {
        label: "How did you identify this pattern?",
        placeholder: "What clues in the problem pointed you to this approach?",
        show: true,
      },
      keyInsight: {
        label: "Key Insight",
        placeholder: "The single thing that makes this problem click...",
        hint: 'In one sentence — what\'s the "aha!" moment?',
        show: true,
      },
      simpleExplanation: {
        label: "Explain It Simply",
        placeholder:
          "Explain to a non-programmer. Where does this appear in real software?",
        show: true,
      },
      challenges: {
        label: "What Was Challenging?",
        placeholder:
          "Where did you get stuck? What made this harder than expected?",
        show: true,
      },
    },
    showSolutionTabs: true,
    showFollowUps: true,
  },
  SYSTEM_DESIGN: {
    // SD does not use the multi-step stepper concept from coding.
    // It uses a single-page workspace with 5 structured panels.
    // The steps array is kept for compatibility but the SD page
    // uses its own layout.
    steps: [
      {
        id: 1,
        label: "Requirements",
        icon: "📋",
        desc: "Functional + non-functional",
      },
      {
        id: 2,
        label: "Estimation",
        icon: "🔢",
        desc: "Back-of-envelope capacity math",
      },
      {
        id: 3,
        label: "API Design",
        icon: "🔌",
        desc: "Endpoints and data contracts",
      },
      {
        id: 4,
        label: "Architecture",
        icon: "🏗️",
        desc: "Components and data flow diagram",
      },
      {
        id: 5,
        label: "Trade-offs",
        icon: "⚖️",
        desc: "Decisions and failure modes",
      },
    ],

    // isSystemDesign flag tells SubmitSolutionPage to render the SD workspace
    // instead of the generic form
    isSystemDesign: true,
    fields: {}, // SD uses sdFields — kept empty for API consistency across categories

    // These fields map to categorySpecificData JSON keys
    sdFields: {
      functionalRequirements: {
        label: "Functional Requirements",
        placeholder:
          "List what the system must DO.\n\nFormat: User can [action] so that [outcome]\n\nExample for WhatsApp:\n• Users can send text messages to other users\n• Users can create group chats (max 256 members)\n• Users can send media (images, video, voice)\n• Users can see message delivery status (sent/delivered/read)\n• Users can set online/offline status",
        hint: "Focus on WHAT, not HOW. No implementation details here.",
        rows: 8,
      },
      nonFunctionalRequirements: {
        label: "Non-Functional Requirements",
        placeholder:
          "System quality attributes — performance, availability, scale.\n\nExample:\n• 50M DAU\n• Messages delivered in < 100ms (P99)\n• 99.99% availability (< 53 min downtime/year)\n• Support 10B messages/day\n• Messages must not be lost (durability)\n• Eventual consistency acceptable for group chats",
        hint: "NFRs drive your entire architecture. Scale numbers here justify every design decision.",
        rows: 7,
      },
      capacityEstimation: {
        label: "Capacity Estimation",
        placeholder:
          "Back-of-envelope math. Use round numbers and powers of 10.\n\nExample:\n• DAU: 50M users\n• Avg messages sent/user/day: 40\n• Total writes/day: 50M × 40 = 2B messages/day\n• Writes/second: 2B / 86,400 ≈ 23,000 msg/sec\n• Read:Write ratio: 1:1 (each message read once)\n• Reads/second: ~23,000\n• Avg message size: 100 bytes\n• Storage/day: 2B × 100B = 200GB/day\n• 5-year storage: 200GB × 365 × 5 ≈ 365TB",
        hint: "Interviewers don't care if numbers are exact. They care that you can reason about scale.",
        rows: 10,
      },
      apiDesign: {
        label: "API Design",
        placeholder:
          "Define your core API endpoints.\n\nFormat: METHOD /path — description\nRequest: { field: type }\nResponse: { field: type }\n\nExample:\nPOST /messages\n  Request: { senderId, receiverId, content, type: 'text|media' }\n  Response: { messageId, timestamp, status: 'sent' }\n\nGET /conversations/{userId}?page=1\n  Response: { conversations: [{ id, lastMessage, unreadCount }] }\n\nGET /messages/{conversationId}?before={timestamp}&limit=50\n  Response: { messages: [{ id, senderId, content, timestamp, status }] }",
        hint: "Name your endpoints. Specify request/response shapes. Interviewers use this to check if you understand the system's surface area.",
        rows: 12,
        isCode: true,
        language: "plaintext",
      },
      schemaDesign: {
        label: "Database Schema",
        placeholder:
          "Define your key tables/collections.\n\nExample (SQL):\nusers: id, phone_number, name, last_seen, created_at\n\nmessages: id, conversation_id, sender_id, content, type,\n          status ENUM('sent','delivered','read'),\n          created_at\n          INDEX(conversation_id, created_at DESC)\n\nconversations: id, type ENUM('direct','group'), created_at\nconversation_members: conversation_id, user_id, joined_at\n\nExample (NoSQL):\nMessage document: { _id, conversationId, senderId, content,\n                    timestamp, readBy: [userId] }",
        hint: "Schema design reveals whether you understand your access patterns. Add indexes that match your query patterns.",
        rows: 12,
        isCode: true,
        language: "sql",
      },
      architectureNotes: {
        label: "Architecture Description",
        placeholder:
          "Describe your architecture in text (your diagram tells the visual story).\n\nExample:\nClients connect via WebSocket to Chat Service for real-time messaging.\nChat Service writes to Message DB (Cassandra — write-heavy, time-series data).\nFan-out Service handles group message delivery asynchronously via Message Queue.\nPresence Service tracks online status with Redis TTL keys.\nMedia is stored in Object Storage (S3) with CDN for delivery.\nPush Notification Service handles offline delivery via APNs/FCM.",
        hint: "This is the companion text to your architecture diagram. Explain WHY each component exists.",
        rows: 8,
      },
      tradeoffReasoning: {
        label: "Key Design Decisions & Trade-offs",
        placeholder:
          "For each major decision, explain what you chose and what you traded away.\n\nFormat: Decision → Choice → Trade-off\n\nExample:\n1. Database: Cassandra over PostgreSQL\n   → High write throughput (23K/sec), time-series queries by conversationId\n   → Trade-off: No ACID transactions, eventual consistency\n\n2. Message delivery: WebSockets over HTTP polling\n   → Real-time delivery, no polling overhead\n   → Trade-off: Connection state, harder to scale horizontally\n\n3. Message fan-out: Async queue over synchronous\n   → Sender gets instant ACK, receivers get eventual delivery\n   → Trade-off: Messages can arrive slightly out of order in groups\n\n4. CAP choice: AP over CP\n   → Available even during network partition\n   → Trade-off: Some users may temporarily see stale data",
        hint: "This is the highest-signal section. Strong candidates make decisions explicit and acknowledge what they traded away.",
        rows: 12,
      },
      failureModes: {
        label: "Failure Modes & Mitigations",
        placeholder:
          "What breaks first? How do you handle it?\n\nExample:\n• Chat Service crash → WebSocket reconnects, client replays from last messageId\n• Message DB node failure → Cassandra replication (RF=3), automatic failover\n• Fan-out queue backlog → Scale consumers horizontally, dead letter queue for failed deliveries\n• Media upload failure → Client retries with exponential backoff, idempotent upload key\n• Network partition → Accept and queue writes, sync on reconnect (offline-first)",
        hint: "Interviewers always probe failure modes. Answering this proactively signals production experience.",
        rows: 8,
      },
    },

    // For the solution display card, map fields to readable labels
    displayConfig: {
      sections: [
        {
          key: "functionalRequirements",
          label: "Functional Requirements",
          icon: "📋",
        },
        {
          key: "nonFunctionalRequirements",
          label: "Non-Functional Requirements",
          icon: "⚙️",
        },
        { key: "capacityEstimation", label: "Capacity Estimation", icon: "🔢" },
        { key: "apiDesign", label: "API Design", icon: "🔌", isCode: true },
        {
          key: "schemaDesign",
          label: "Database Schema",
          icon: "🗄️",
          isCode: true,
        },
        { key: "architectureNotes", label: "Architecture", icon: "🏗️" },
        { key: "tradeoffReasoning", label: "Trade-offs", icon: "⚖️" },
        { key: "failureModes", label: "Failure Modes", icon: "🔥" },
      ],
    },

    showFollowUps: true,
  },
  LOW_LEVEL_DESIGN: {
    steps: [
      {
        id: 1,
        label: "Entities",
        icon: "📦",
        desc: "Identify classes, interfaces, and relationships",
      },
      {
        id: 2,
        label: "Design",
        icon: "🔧",
        desc: "Class hierarchy, patterns, and method signatures",
      },
      {
        id: 3,
        label: "Code",
        icon: "💻",
        desc: "Class implementations and key methods",
      },
      {
        id: 4,
        label: "Extensibility",
        icon: "🔬",
        desc: "SOLID principles and follow-up requirements",
      },
    ],

    // isLowLevelDesign flag tells SubmitSolutionPage to render the LLD workspace
    isLowLevelDesign: true,

    // Empty fields for API consistency — LLD uses lldFields
    fields: {},

    // LLD-specific structured fields stored in categorySpecificData
    lldFields: {
      entities: {
        label: "Entity Identification",
        placeholder:
          "List the core classes and interfaces with their responsibilities.\n\nFormat:\nClassName — what it is responsible for\n\nExample (Parking Lot):\nParkingLot — manages floors, entry/exit, capacity tracking\nParkingFloor — manages spots on a floor, tracks availability\nParkingSpot — represents one space, knows its type and occupancy\nVehicle (abstract) — base class with license plate and type\nCar, Truck, Motorcycle — concrete vehicle types\nTicket — records entry time, spot, and vehicle\nPayment (interface) — fee calculation contract\nHourlyPayment, FlatRatePayment — payment strategies\n\nFor each class ask: What is its ONE responsibility?",
        hint: "Wrong entity identification = wrong design. Spend time here before writing any code.",
        rows: 14,
      },
      classHierarchy: {
        label: "Class Hierarchy & Relationships",
        placeholder:
          "Describe the structure — inheritance, composition, and interfaces.\n\nUse text UML or plain English:\n\nabstract class Vehicle\n  fields: licensePlate: String, type: VehicleType\n  abstract method: getType(): VehicleType\n\nclass Car extends Vehicle\nclass Truck extends Vehicle\nclass Motorcycle extends Vehicle\n\ninterface PaymentStrategy\n  method: calculateFee(ticket: Ticket): double\n\nclass HourlyPayment implements PaymentStrategy\nclass FlatRatePayment implements PaymentStrategy\n\nParkingLot HAS-A List<ParkingFloor> (composition)\nParkingFloor HAS-A List<ParkingSpot> (composition)\nTicket REFERENCES Vehicle (association)\n\nKey decisions:\n- Used Strategy pattern for payment (open/closed for new fee types)\n- Used abstract class for Vehicle (shared state: licensePlate)\n- Used interface for Payment (no shared state between strategies)",
        hint: "Explain WHY you chose inheritance vs composition vs interface for each relationship. This is what interviewers probe.",
        rows: 16,
        isCode: true,
      },
      designPattern: {
        label: "Design Pattern Justification",
        placeholder:
          "Which pattern(s) did you apply and why?\n\nFormat: Pattern → Problem it solves → Why this pattern fits\n\nExample:\nStrategy Pattern → Fee calculation varies by vehicle type and time\n  → Encapsulates each algorithm in its own class\n  → New fee types (weekend rate, VIP) can be added without modifying ParkingLot\n  → Satisfies Open/Closed Principle\n\nFactory Pattern → Creating Vehicle subclasses from a type enum\n  → Centralizes creation logic, client code doesn't need to know concrete types\n  → Satisfies Dependency Inversion (depend on Vehicle abstraction)\n\nSingleton → ParkingLot itself (there is only one)\n  → But be careful: Singleton makes testing harder — consider dependency injection",
        hint: "Don't just name the pattern. Explain the structural reason it fits. Interviewers can tell the difference.",
        rows: 10,
      },
      solidAnalysis: {
        label: "SOLID Principles Analysis",
        placeholder:
          "For each SOLID principle, state whether your design satisfies it with a specific example.\n\nS — Single Responsibility Principle:\n  ✓ ParkingLot handles capacity management only. Payment is separate.\n  ✓ ParkingSpot tracks occupancy only. Pricing is in PaymentStrategy.\n\nO — Open/Closed Principle:\n  ✓ Adding a MotorcycleSpot type extends ParkingSpot without modifying existing code.\n  ✓ New payment strategies implement PaymentStrategy without touching ParkingLot.\n\nL — Liskov Substitution Principle:\n  ✓ Any Vehicle subtype (Car, Truck) can be used wherever Vehicle is expected.\n  ✓ No subclass breaks the contract defined by the parent.\n\nI — Interface Segregation Principle:\n  ✓ PaymentStrategy has only one method — calculateFee().\n  ✗ Could be violated if we added unrelated methods to Vehicle base class.\n\nD — Dependency Inversion Principle:\n  ✓ ParkingLot depends on PaymentStrategy interface, not concrete implementations.\n  ✓ High-level modules (ParkingLot) don't depend on low-level details (HourlyPayment).",
        hint: "Be honest about violations. Identifying where your design breaks SOLID is a strong signal of experience.",
        rows: 14,
      },
      extensibilityAnalysis: {
        label: "Extensibility Analysis",
        placeholder:
          "For each follow-up requirement, explain how your design handles it.\n\nAnalyze these common additions:\n\n1. Add a new vehicle type (e.g., Electric Vehicle)\n   → Extend Vehicle abstract class. No existing code changes.\n   → Add EvSpot extending ParkingSpot if needed. ParkingFloor unchanged.\n   → Cost: O(1) — 1-2 new files, 0 modified files ✓\n\n2. Change fee calculation (e.g., surge pricing)\n   → Create SurgePricingPayment implementing PaymentStrategy.\n   → Inject into ParkingLot at runtime. Existing strategies unchanged.\n   → Cost: 1 new file, 0 modified files ✓\n\n3. Add a reservation system\n   → ParkingLot currently has no reservation concept — this requires schema change.\n   → Would add Reservation class, reserveSpot() on ParkingSpot.\n   → Cost: 2-3 new files, 1 modified file (ParkingSpot) — acceptable ✓\n\n4. Support multiple parking lot locations\n   → ParkingLotManager (new) manages multiple ParkingLot instances.\n   → No changes to ParkingLot needed ✓\n\n5. Add a display board showing availability\n   → Observer pattern: ParkingFloor notifies DisplayBoard on spot change.\n   → ParkingFloor was not designed as Observable — this is a gap ✗\n   → Fix: ParkingFloor should implement Observable from the start.",
        hint: "Honest gap analysis is valued. Saying 'my design breaks here for this reason' signals production experience.",
        rows: 16,
      },
    },
    // For solution display card
    displayConfig: {
      sections: [
        { key: "entities", label: "Entity Identification", icon: "📦" },
        {
          key: "classHierarchy",
          label: "Class Hierarchy",
          icon: "🗂️",
          isCode: true,
        },
        {
          key: "designPattern",
          label: "Design Pattern Justification",
          icon: "🧩",
        },
        { key: "solidAnalysis", label: "SOLID Analysis", icon: "🏛️" },
        {
          key: "extensibilityAnalysis",
          label: "Extensibility Analysis",
          icon: "🔬",
        },
      ],
    },

    // LLD keeps showSolutionTabs: true for code implementation
    // The code tab renders the actual class implementations
    showSolutionTabs: true,
    solutionTabConfig: {
      types: [
        { id: "INITIAL", label: "Initial Design", icon: "📐" },
        { id: "REFINED", label: "Refined Design", icon: "✨" },
        { id: "ALTERNATIVE", label: "Alternative Approach", icon: "🔄" },
      ],
      approachLabel: "Class Hierarchy Description",
      approachPlaceholder:
        "Describe the overall class structure before writing code.\n\nWhich classes are abstract? Which implement interfaces?\nWhat are the key relationships (HAS-A vs IS-A)?",
      complexityLabels: {
        time: "Number of Classes / Interfaces",
        space: "Memory per Instance",
      },
      codeLabel: "Implementation",
      codePlaceholder:
        "// Write your key class implementations\n// Focus on: constructors, core methods, and relationships\n// You don't need to implement every method — focus on the design\n\npublic abstract class Vehicle {\n    private final String licensePlate;\n    private final VehicleType type;\n\n    public Vehicle(String licensePlate, VehicleType type) {\n        this.licensePlate = licensePlate;\n        this.type = type;\n    }\n\n    public abstract VehicleType getType();\n    public String getLicensePlate() { return licensePlate; }\n}\n\npublic interface PaymentStrategy {\n    double calculateFee(Ticket ticket);\n}\n\npublic class HourlyPayment implements PaymentStrategy {\n    private static final double HOURLY_RATE = 10.0;\n\n    @Override\n    public double calculateFee(Ticket ticket) {\n        long hours = ChronoUnit.HOURS.between(\n            ticket.getEntryTime(), LocalDateTime.now()\n        );\n        return Math.max(1, hours) * HOURLY_RATE;\n    }\n}",
      defaultLanguage: "JAVA",
      notesLabel: "Design Notes & Assumptions",
    },
    showFollowUps: true,
  },
  BEHAVIORAL: {
    // ── Behavioral Interview Form Configuration ─────────────────────────────
    //
    // STAR is not a writing format — it is a structured recall framework
    // grounded in behavioral psychology. Each component maps to a distinct
    // cognitive and evaluative dimension:
    //
    //   Competency  → Metacognition: do you know what's being tested?
    //   Situation   → Context-setting: can you scope and frame clearly?
    //   Task        → Role clarity: what were YOU responsible for?
    //   Action      → Behavioral signal: what did YOU specifically do?
    //   Result      → Impact awareness: do you understand causality?
    //   Reflection  → Growth mindset: the highest-signal section for
    //                 senior roles — predicts future performance
    //
    // The existing generic form path silently dropped the Action field
    // because showActionSection was defined but never rendered.
    // This is a structural fix, not a feature addition.
    //
    // isBehavioral flag tells SubmitSolutionPage to render BehavioralWorkspace
    // instead of the generic form.
    //
    isBehavioral: true,
    // Empty fields for API consistency — BEHAVIORAL uses behavioralFields
    fields: {},
    steps: [
      {
        id: 1,
        label: "Competency",
        icon: "🎯",
        desc: "What is this question really testing?",
      },
      {
        id: 2,
        label: "Situation",
        icon: "📖",
        desc: "Set the scene — specific, named, scoped",
      },
      {
        id: 3,
        label: "Action",
        icon: "⚡",
        desc: "What YOU did — step by step",
      },
      {
        id: 4,
        label: "Result",
        icon: "📊",
        desc: "What happened — quantified impact",
      },
      {
        id: 5,
        label: "Reflection",
        icon: "🔬",
        desc: "Learning and what you'd change",
      },
    ],
    // Behavioral-specific structured fields stored in categorySpecificData JSON column.
    // These map to named keys, not reused Solution columns with relabeled text.
    // This preserves semantic meaning for RAG retrieval and AI evaluation.
    behavioralFields: {
      competency: {
        label: "Competency Being Tested",
        placeholder:
          "Before writing your story, name the competency this question is probing.\n\n" +
          "Examples:\n" +
          '• "Tell me about a time you led a team through ambiguity"\n' +
          "  → Competency: Leadership under uncertainty. The interviewer is checking: Can they make decisions without complete information? Do they keep the team aligned?\n\n" +
          '• "Tell me about a conflict with a teammate"\n' +
          "  → Competency: Conflict resolution and interpersonal maturity. The interviewer is checking: Do they escalate, avoid, or resolve? Do they take accountability?\n\n" +
          '• "Describe a time you failed"\n' +
          "  → Competency: Self-awareness and growth mindset. The interviewer is checking: Are they honest? Do they blame others? Can they analyze their own failures objectively?\n\n" +
          '• "Tell me about a time you had to push back on a decision"\n' +
          "  → Competency: Courage and professional judgment. The interviewer is checking: Do they have a spine? Can they disagree constructively without damaging relationships?\n\n" +
          "Write the competency being tested and the interviewer's real underlying concern:",
        hint: "This is the most important step and the one most candidates skip. If you answer the question without knowing the competency, you are rolling dice. Name it first, answer second.",
        rows: 8,
        required: true,
      },
      situation: {
        label: "Situation & Task",
        placeholder:
          "Set the scene. Be specific — vague context destroys credibility.\n\n" +
          "What to include:\n" +
          "• Company and team (you can anonymize if needed, but be specific about scale and context)\n" +
          "• Timeline — when did this happen?\n" +
          "• Stakes — what was at risk? Why did it matter?\n" +
          "• YOUR specific role and responsibility — not the team's, yours\n\n" +
          "Strong example:\n" +
          '"In Q3 2023 at [Company], I was the tech lead on a team of 4 engineers responsible for migrating our monolithic auth service to a distributed microservice before a hard deadline tied to a compliance requirement. Two weeks before launch, our lead engineer went on emergency leave."\n\n' +
          "Weak example:\n" +
          '"My team was working on a project and we ran into some challenges."\n\n' +
          "Write your Situation and Task:",
        hint: "Interviewers calibrate every answer against your seniority. A junior engineer leading 2 people is impressive. A senior engineer leading 2 people is a red flag. Set the context so your actions land with the right weight.",
        rows: 8,
        required: true,
      },
      action: {
        label: "Action — What YOU Did",
        placeholder:
          'This is the core of your answer. Use "I" not "we".\n\n' +
          "What interviewers are evaluating here:\n" +
          "• Did they take initiative or wait to be told?\n" +
          "• Did they think through trade-offs or just execute?\n" +
          "• Did they communicate, delegate, unblock, or escalate at the right moments?\n" +
          "• What does their decision-making process look like under pressure?\n\n" +
          "How to structure it:\n" +
          "Break your actions into numbered steps. Each step should name a specific decision or action you took.\n\n" +
          "Strong example:\n" +
          '"1. I immediately assessed what was blocked and what could still proceed — I found 60% of the work could continue without the missing engineer.\n' +
          "2. I had a 30-minute call with the PM to reset expectations and negotiate a 5-day extension on the least critical module.\n" +
          "3. I pair-programmed with our most junior engineer on the complex auth token rotation logic rather than doing it myself — I needed to build her confidence quickly.\n" +
          '4. I wrote detailed daily status notes so leadership never had to ask for an update."\n\n' +
          "Weak example:\n" +
          '"We figured it out together and worked extra hours to get it done."\n\n' +
          "Write your specific actions, step by step:",
        hint: 'The Action section is where candidates either demonstrate leadership or reveal they were passengers. "We" answers consistently fail — interviewers interpret them as inability to separate personal contribution from team effort, or worse, taking credit for the team\'s work.',
        rows: 12,
        required: true,
      },
      result: {
        label: "Result & Impact",
        placeholder:
          "What happened? Quantify wherever possible.\n\n" +
          "Strong result elements:\n" +
          "• The immediate outcome — did you succeed? Partially succeed? Fail productively?\n" +
          "• Quantified impact — numbers, percentages, time saved, revenue, error reduction\n" +
          "• Business/team impact beyond the immediate task\n" +
          "• Timeline — how long did it take to see the result?\n\n" +
          "Strong example:\n" +
          '"We shipped on the extended deadline with zero P0 incidents in the first 30 days. The migration reduced auth service latency by 40% (p99: 800ms → 480ms). My junior engineer went on to lead the next migration independently 3 months later."\n\n' +
          "If the result was a failure or partial success:\n" +
          '"We missed the deadline by 8 days. The business took a minor compliance penalty but avoided a larger one by having the core functionality live. The post-mortem I led resulted in a new on-call coverage policy that prevented the same situation 4 months later."\n\n' +
          "(Honest failure results are often MORE impressive than clean successes — they signal maturity.)\n\n" +
          "Write your result:",
        hint: 'If you have no numbers, estimate. "Roughly 30% faster" or "maybe 2 hours saved per week across 10 engineers" is better than "improved performance." Interviewers know you don\'t have perfect data — they\'re evaluating whether you think in terms of impact.',
        rows: 6,
        required: false,
      },
      reflection: {
        label: "Reflection — Learning & What You'd Do Differently",
        placeholder:
          "This section separates good candidates from exceptional ones.\n\n" +
          "What interviewers are measuring:\n" +
          "• Self-awareness: can you see your own blind spots?\n" +
          "• Growth mindset: do you treat every experience as a learning event?\n" +
          "• Psychological safety: are you comfortable with honest self-critique in a high-stakes setting?\n" +
          "• Trajectory: is this person still improving or have they plateaued?\n\n" +
          "What to include:\n" +
          "• What you learned about yourself, your skills, or your judgment\n" +
          "• What you would do differently with the knowledge you have now\n" +
          "• How this experience changed your approach to similar situations since\n\n" +
          "Strong example:\n" +
          "\"Looking back, I over-indexed on technical execution and under-invested in stakeholder communication in the first week. I assumed leadership trusted the process — I should have proactively set up a daily 5-minute sync. I now treat stakeholder communication as a deliverable, not an afterthought. I have not had a leadership surprise on any project I've led since.\n\n" +
          "I also learned that I default to doing things myself when under pressure. Pair-programming with the junior engineer was the right move in retrospect, but it was uncomfortable in the moment. I have since made it a habit to ask 'who else grows from this?' before taking on a technical task solo.\"\n\n" +
          "Write your honest reflection:",
        hint: "Candidates who skip or shorten this section consistently score lower on self-awareness dimensions. Interviewers at senior levels weight reflection as heavily as Action. A shallow reflection after a strong STAR story is a yellow flag — it suggests the learning did not stick.",
        rows: 8,
        required: false,
      },
    },
    // For the solution display card — how to render submitted behavioral answers.
    // Mirrors the HR displayConfig pattern for SolutionCard rendering.
    displayConfig: {
      sections: [
        { key: "competency", label: "Competency Being Tested", icon: "🎯" },
        { key: "situation", label: "Situation & Task", icon: "📖" },
        { key: "action", label: "Action", icon: "⚡" },
        { key: "result", label: "Result & Impact", icon: "📊" },
        { key: "reflection", label: "Reflection", icon: "🔬" },
      ],
    },
    showFollowUps: true,
    showSolutionTabs: false,
  },
  CS_FUNDAMENTALS: {
    // ── Technical Knowledge Form Configuration ──────────────────────────────
    //
    // "Technical Knowledge" is the display label. The enum key CS_FUNDAMENTALS
    // stays unchanged in the DB — no migration needed.
    //
    // This category is PURELY THEORETICAL — no code, no implementation.
    // Every question is a concept explanation question:
    //   "Explain how X works"
    //   "What is the difference between X and Y"
    //   "Why does X exist — what problem does it solve"
    //   "What happens when X fails"
    //   "What are the trade-offs between X and Y"
    //
    // Seven subject domains (research basis: what tier-1 companies actually test):
    //   1. Operating Systems
    //   2. Computer Networking
    //   3. Database Internals (conceptual — not SQL query writing)
    //   4. Data Structures & Algorithms (WHY they work — not implementation)
    //   5. Distributed Systems & System Concepts
    //   6. AI / Machine Learning Fundamentals
    //   7. Data Engineering Concepts
    //
    // Evaluation framework — three independent dimensions:
    //   Mechanism Depth   → Do they know HOW it works, not just WHAT it is?
    //   Trade-off Awareness → Do they know what was sacrificed to get the benefit?
    //   Real-world Anchoring → Can they connect it to a production system?
    //
    // isTechnicalKnowledge flag tells SubmitSolutionPage to render
    // TechnicalKnowledgeWorkspace instead of the generic form.
    //
    isTechnicalKnowledge: true,
    // Empty fields for API consistency — TK uses technicalKnowledgeFields
    fields: {},
    steps: [
      {
        id: 1,
        label: "Subject",
        icon: "📚",
        desc: "Topic area and concept being explained",
      },
      {
        id: 2,
        label: "Mechanism",
        icon: "⚙️",
        desc: "How it works — the actual mechanism",
      },
      {
        id: 3,
        label: "Design",
        icon: "🎯",
        desc: "Why it was designed this way",
      },
      {
        id: 4,
        label: "Trade-offs",
        icon: "⚖️",
        desc: "What it sacrifices, when alternatives are better",
      },
      {
        id: 5,
        label: "Production",
        icon: "🌍",
        desc: "Real-world usage and misconceptions",
      },
    ],
    // Technical Knowledge structured fields stored in categorySpecificData JSON column.
    technicalKnowledgeFields: {
      subject: {
        label: "Subject Area & Concept",
        placeholder:
          "Name the subject area and the specific concept being explained.\n\n" +
          "Format: [Subject Area] — [Specific Concept]\n\n" +
          "Examples:\n" +
          "• Operating Systems — Virtual Memory and Page Faults\n" +
          "• Computer Networking — TCP 3-Way Handshake and Connection Lifecycle\n" +
          "• Database Internals — B-Tree Index Mechanics and Query Optimization\n" +
          "• Distributed Systems — CAP Theorem and Consistency Trade-offs\n" +
          "• AI/ML Fundamentals — Gradient Descent and Learning Rate\n" +
          "• Data Structures — Why HashMap is O(1) Amortized, Not O(1) Worst Case\n" +
          "• Data Engineering — Batch vs Stream Processing Trade-offs\n\n" +
          "Write the subject area and concept:",
        hint: "Being precise about the concept before explaining it forces the metacognitive step that separates deep understanding from surface familiarity. Vague subject → vague explanation.",
        rows: 4,
        required: true,
      },
      coreExplanation: {
        label: "Core Explanation — How It Works",
        placeholder:
          "Explain the MECHANISM. Not the definition — the mechanism.\n\n" +
          "The difference:\n" +
          '✗ "TCP is a reliable, connection-oriented protocol."\n' +
          "   (Definition. Any textbook. Fails interviews.)\n\n" +
          '✓ "TCP achieves reliability through three mechanisms working together:\n' +
          "   1. Sequence numbers on every segment so the receiver can detect gaps\n" +
          "      and request retransmission of missing segments.\n" +
          "   2. Cumulative acknowledgments — the receiver ACKs the highest\n" +
          "      in-order byte received, not individual segments.\n" +
          "   3. Retransmission timers — if the sender doesn't receive an ACK\n" +
          "      within the RTO window, it retransmits from the last unACKed segment.\n" +
          "   The connection state (SYN → ESTABLISHED → FIN_WAIT → TIME_WAIT) is\n" +
          "   what enables ordered teardown and protects against delayed packets\n" +
          '   from a previous connection being mistaken for new data."\n' +
          "   (Mechanism. Tells the interviewer you actually understand it.)\n\n" +
          "Write your mechanism-level explanation:",
        hint: 'Interviewers probe until you hit your ceiling. Explaining the mechanism first means you\'re not guessing when the follow-up questions come. "How does X actually work inside?" should be answered before they ask.',
        rows: 14,
        required: true,
      },
      whyItExists: {
        label: "Why It Was Designed This Way",
        placeholder:
          "What problem does this solve? What would break without it?\n" +
          "Why was this approach chosen over alternatives that existed at the time?\n\n" +
          "This is the question most candidates cannot answer. They know WHAT it is\n" +
          "but not WHY the engineers made this specific design decision.\n\n" +
          "Strong example (Virtual Memory):\n" +
          '"Before virtual memory, programs had to fit in physical RAM and manage\n' +
          " their own memory layout. This caused two problems:\n" +
          " 1. Programs were limited to available physical RAM — impossible to run\n" +
          "    large programs on small machines.\n" +
          " 2. Multiple programs sharing memory had no isolation — one program could\n" +
          "    corrupt another's memory.\n" +
          " Virtual memory solves both by giving each process its own address space\n" +
          " (isolation) and backing it with both physical RAM and disk (larger than\n" +
          " physical RAM). The OS page table maps virtual → physical transparently.\n" +
          " The trade-off is latency: a page fault (accessing a page not in RAM)\n" +
          " costs ~10ms disk I/O vs ~100ns RAM access — a 100,000x difference.\n" +
          ' This is why thrashing (constant page faulting) kills performance."\n\n' +
          "Write your design rationale:",
        hint: "This section signals seniority more than any other. A junior engineer knows what something is. A senior engineer knows why it was built this way and what alternatives were rejected.",
        rows: 10,
        required: false,
      },
      tradeoffs: {
        label: "Trade-offs — What It Sacrifices",
        placeholder:
          "Every design decision sacrifices something to gain something else.\n" +
          "Name what this approach gives up and when a different approach is better.\n\n" +
          "Format: Benefit → Cost → When to choose differently\n\n" +
          "Strong example (B-Tree Index):\n" +
          '"B-Tree index:\n' +
          " + Benefit: O(log n) lookups, range queries work, sorted access.\n" +
          " - Cost: Write overhead — every INSERT/UPDATE/DELETE must update\n" +
          "   the index. For write-heavy tables, indexes slow down writes.\n" +
          "   Storage overhead — index takes additional disk space.\n" +
          "   Rebalancing cost — B-Tree splits and merges on heavy writes\n" +
          "   can cause lock contention.\n" +
          " → Choose differently: Hash index for equality-only lookups (faster\n" +
          "   than B-Tree for exact matches, but NO range queries). No index for\n" +
          "   write-heavy columns that are rarely queried. Partial index when\n" +
          "   only a subset of rows are queried (e.g., WHERE status = 'active').\"\n\n" +
          "Write the trade-offs for this concept:",
        hint: "Candidates who can only articulate benefits fail senior-level interviews. The interviewer is specifically looking for evidence that you understand the design space, not just the happy path.",
        rows: 10,
        required: false,
      },
      realWorldUsage: {
        label: "Real-World Usage & Common Misconceptions",
        placeholder:
          "Two things in one section:\n\n" +
          "1. WHERE DOES THIS APPEAR IN REAL SYSTEMS?\n" +
          "Name specific systems, products, or scenarios where this concept\n" +
          "is actively in use. Not generic — specific.\n\n" +
          'Strong: "Consistent hashing is used by Cassandra and DynamoDB for\n' +
          "distributing data across nodes without full reshuffling on node\n" +
          "add/remove. Akamai uses it for CDN edge routing. Redis Cluster uses\n" +
          'a simplified version with 16384 hash slots."\n\n' +
          'Weak: "Consistent hashing is used in distributed systems."\n\n' +
          "2. COMMON MISCONCEPTIONS — what do most people get wrong?\n" +
          "What does the interviewer probe for specifically?\n" +
          "What did YOU get wrong before deeply learning this?\n\n" +
          "Strong: \"Common mistake: confusing CAP 'consistency' with ACID\n" +
          "'consistency'. In CAP, C means all nodes see the same data at the\n" +
          "same time (linearizability). In ACID, C means the database remains\n" +
          "in a valid state per defined constraints. Completely different.\n" +
          'This confusion causes wrong architecture decisions constantly."\n\n' +
          "Write your real-world usage and misconceptions:",
        hint: "The misconceptions sub-section is the highest-signal part of this entire workspace. The interviewer knows the gotchas. Demonstrating you know them — and have internalized them — shows production-level understanding.",
        rows: 10,
        required: false,
      },
    },
    // For solution display card — how to render submitted TK answers.
    // Mirrors the HR and Behavioral displayConfig patterns.
    displayConfig: {
      sections: [
        { key: "subject", label: "Subject & Concept", icon: "📚" },
        { key: "coreExplanation", label: "How It Works", icon: "⚙️" },
        {
          key: "whyItExists",
          label: "Why It Was Designed This Way",
          icon: "🎯",
        },
        { key: "tradeoffs", label: "Trade-offs", icon: "⚖️" },
        {
          key: "realWorldUsage",
          label: "Real-World Usage & Misconceptions",
          icon: "🌍",
        },
      ],
    },
    showFollowUps: true,
    showSolutionTabs: false,
  },
  HR: {
    // ── HR Round Form Configuration ────────────────────────────────
    //
    // HR interviews test six underlying concerns — not algorithms, not code.
    // The form reflects the actual structure of strong HR answers:
    //   1. Understand what's really being asked (metacognition before answering)
    //   2. Craft the answer (the primary artifact)
    //   3. Make it company-specific (the #1 failure mode is generic answers)
    //   4. Self-assess honestly (what's strong, what needs work)
    //   5. Categorize the question (for tracking and coaching)
    //
    // No code editor. No algorithm pattern selector. No brute force/optimized.
    // No Feynman explanation (irrelevant for personal narrative answers).
    // No external link. No difficulty badge (replaced by stakes on the view).
    //
    // isHRRound flag tells the submit page to render the HR workspace
    // instead of the generic form.
    isHRRound: true,

    // Empty fields for API consistency — HR uses hrFields
    fields: {},

    steps: [
      {
        id: 1,
        label: "Analyze",
        icon: "🔍",
        desc: "What is the interviewer really checking?",
      },
      {
        id: 2,
        label: "Answer",
        icon: "💬",
        desc: "Your complete, polished response",
      },
      {
        id: 3,
        label: "Tailor",
        icon: "🎯",
        desc: "Make it specific to this company",
      },
      {
        id: 4,
        label: "Reflect",
        icon: "🪞",
        desc: "Honest self-assessment",
      },
    ],

    // HR-specific structured fields stored in categorySpecificData
    hrFields: {
      underlyingConcern: {
        label: "What is the interviewer really checking?",
        placeholder:
          'Before answering, identify the real concern behind this question.\n\nExamples:\n• "Why do you want to work here?" = They\'re checking: Did you research us? Do you specifically want THIS job, or just any job? Are you likely to stay?\n\n• "What is your greatest weakness?" = They\'re checking: Are you self-aware? Can you take feedback? Are you honest under pressure, or do you give a fake answer?\n\n• "Why did you leave your last job?" = They\'re checking: Was there a problem? Is there a pattern? Are you a flight risk?\n\n• "Tell me about yourself" = They\'re checking: Does your career story make sense? Is this job a logical next step? Do you communicate clearly?\n\nWrite your analysis of what THIS specific question is really testing:',
        hint: "This is the most important step. You cannot write a strong HR answer without knowing the real question behind the question. Every generic answer fails because the candidate answered the surface question, not the real one.",
        rows: 8,
        required: true,
      },

      answer: {
        label: "Your Answer",
        placeholder:
          'Write your complete, polished response.\n\nGuidelines:\n• Speak in first person — use "I" not "we"\n• Be specific — name real projects, real companies, real numbers\n• Avoid generic phrases: "I am passionate about technology", "I love innovation", "great culture" — these are red flags\n• Appropriate length: 60-120 seconds spoken (about 150-250 words written)\n• End with a clear, memorable point — not a trailing thought\n\nFor weakness/failure questions:\n• Name a REAL weakness — not a disguised strength ("I work too hard")\n• Show genuine evidence of improvement — specific steps you took\n• Keep it relevant: avoid weaknesses that are core to the job\n\nFor "tell me about yourself":\n• Present → Past → Why here: current role → relevant background → why this specific opportunity\n• Keep it to 90 seconds — this is an opener, not your life story',
        hint: "This is your primary artifact. Everything else supports this. Write it out fully — even if you plan to speak it, writing it forces precision.",
        rows: 14,
        required: true,
      },

      companyConnection: {
        label: "Company-Specific Evidence",
        placeholder:
          'What makes your answer specific to THIS company — not any company?\n\nStrong signals interviewers look for:\n• You named a specific product, feature, or engineering decision\n• You referenced something from their engineering blog, public talks, or recent news\n• You mentioned a specific company value and connected it to a real experience\n• You named a specific person at the company whose work influenced your interest\n• You referenced a challenge this company is facing and connected your experience to it\n\nExamples of weak company connection:\n✗ "I love your innovative culture and great products"\n✗ "I\'ve heard great things about your work-life balance"\n✗ "You\'re a leader in the industry"\n\nExamples of strong company connection:\n✓ "I read your engineering blog post about the migration to microservices — that\'s exactly the kind of architectural challenge I worked on at [Company]"\n✓ "Your recent product launch into [market] caught my attention because I have 3 years of experience building for that exact customer segment"\n✓ "[Company value] resonates with me because in my last role I [specific example]"\n\nWrite what makes YOUR answer specific to this company:',
        hint: "Generic answers are the #1 reason candidates fail HR rounds. If your answer could be said in any interview at any company, it needs this section.",
        rows: 8,
        required: false,
      },

      selfAssessment: {
        label: "Honest Self-Assessment",
        placeholder:
          "After writing your answer, critically evaluate it:\n\nWhat is strong about this answer?\n• Is it specific? (names real projects, real companies, real numbers)\n• Does it answer the REAL question, not just the surface question?\n• Is it authentic — does it sound like you, or like a rehearsed script?\n• Is there a clear, memorable ending?\n\nWhat still needs work?\n• Where is it still generic? What specific details are missing?\n• Is there anything that sounds like a red flag when read aloud?\n• For weakness questions: is the weakness real and honest?\n• For achievement questions: does the impact feel quantified and credible?\n\nWhat would you change if you could answer this again?\n\nWrite your honest assessment:",
        hint: "The candidate who can accurately assess their own answer is the one who improves fastest. Be honest — this is your private preparation space, not the actual interview.",
        rows: 8,
        required: false,
      },

      questionCategory: {
        label: "Question Category",
        placeholder: "Select the category that best describes this question",
        hint: "Used for tracking which types of HR questions you have prepared for. Helps identify gaps in your preparation.",
        rows: 1,
        required: false,
      },
    },

    // For the solution display card — how to render submitted HR answers
    displayConfig: {
      sections: [
        {
          key: "underlyingConcern",
          label: "What They Were Really Checking",
          icon: "🔍",
        },
        {
          key: "answer",
          label: "Answer",
          icon: "💬",
        },
        {
          key: "companyConnection",
          label: "Company-Specific Evidence",
          icon: "🎯",
        },
        {
          key: "selfAssessment",
          label: "Self-Assessment",
          icon: "🪞",
        },
      ],
    },

    // HR questions benefit from follow-up probing questions.
    // "Why did you leave?" follow-up: "What specifically wasn't working?"
    // "What is your weakness?" follow-up: "How did you realize this was a weakness?"
    // These are valuable for deep preparation.
    showFollowUps: true,

    // HR answers do not use solution tabs (no brute force / optimized)
    showSolutionTabs: false,
  },
  SQL: {
    // ── Database Category Form Configuration ────────────────────────────────
    //
    // "Databases" is the display label. The enum key SQL stays unchanged
    // in the DB and Prisma schema — no migration needed.
    //
    // This category covers the full scope of what database interviews test:
    //   1. SQL Query Writing — JOINs, CTEs, window functions, aggregations
    //   2. Schema Design — table modeling, normalization, relationships
    //   3. Indexing Strategy — what to index, when, why, and at what cost
    //   4. Query Optimization — execution plans, N+1, rewrite strategies
    //   5. Database Internals — B-Tree mechanics, MVCC, isolation levels
    //   6. NoSQL Trade-offs — when and why to choose non-relational storage
    //
    // Two distinct submission modes determined by problem.categoryData.problemType:
    //   'QUERY'         → candidate writes SQL against a provided schema
    //   'SCHEMA_DESIGN' → candidate designs the schema from requirements
    //
    // isDatabase flag tells SubmitSolutionPage to render DatabaseWorkspace.
    //
    isDatabase: true,
    // Empty fields for API consistency — Database uses databaseFields
    fields: {},
    steps: [
      {
        id: 1,
        label: "Approach",
        icon: "🧠",
        desc: "Analyze schema and plan query or design",
      },
      {
        id: 2,
        label: "Solution",
        icon: "🗄️",
        desc: "Write query or design schema",
      },
      {
        id: 3,
        label: "Indexing",
        icon: "⚡",
        desc: "Index strategy and performance",
      },
      {
        id: 4,
        label: "Trade-offs",
        icon: "⚖️",
        desc: "Optimization and alternatives",
      },
    ],
    // Database-specific structured fields stored in categorySpecificData JSON column.
    // These have named semantic keys unlike the generic Solution columns.
    databaseFields: {
      // ── Query problem fields ──────────────────────────────────────
      queryApproach: {
        label: "Query Approach — Before You Write",
        placeholder:
          "Before writing the query, analyze the schema and plan your approach.\n\n" +
          "What to include:\n" +
          "• Which tables are involved and what are their relationships?\n" +
          "• What JOIN type is appropriate and why? (INNER vs LEFT vs RIGHT)\n" +
          "• Are there NULLs you need to handle explicitly?\n" +
          "• What is the access pattern — equality filter, range, aggregation?\n" +
          "• Is there an N+1 risk if this query were called from application code?\n\n" +
          "Strong example:\n" +
          '"Tables: users (1) → orders (N) → order_items (N).\n' +
          " Need total revenue per user. LEFT JOIN users → orders because we want\n" +
          " users with zero orders too (they should show $0 not be excluded).\n" +
          " Then INNER JOIN orders → order_items since we only want items that\n" +
          " exist. GROUP BY user.id. COALESCE(SUM, 0) for NULL revenue on users\n" +
          ' with no orders."\n\n' +
          "Write your query analysis:",
        hint: "This is what interviewers probe first. Writing code without analyzing the schema first is the #1 signal of a weak database candidate.",
        rows: 8,
        required: true,
      },
      indexStrategy: {
        label: "Index Strategy",
        placeholder:
          "What indexes would you add for this query and why?\n\n" +
          "Format: index type + column(s) → what query operation it serves\n\n" +
          "Strong example:\n" +
          '"CREATE INDEX idx_orders_user_id ON orders(user_id);\n' +
          " → Serves the JOIN condition users.id = orders.user_id\n" +
          " → Without this, the JOIN is a full table scan on orders\n" +
          " → At 10M orders, this is the difference between 5ms and 8000ms\n\n" +
          " CREATE INDEX idx_order_items_order_id ON order_items(order_id);\n" +
          " → Serves the second JOIN condition\n\n" +
          " Would NOT add index on users.id — it already has a PRIMARY KEY index\n\n" +
          " Trade-off: These indexes speed up reads but add ~30% write overhead\n" +
          " to INSERT/UPDATE/DELETE on orders and order_items. Acceptable for\n" +
          ' read-heavy analytics queries."\n\n' +
          "Write your index strategy:",
        hint: "Interviewers always ask about indexes. Answering proactively before they ask is a strong senior-level signal.",
        rows: 8,
        required: false,
      },
      optimizationNotes: {
        label: "Optimization & Edge Cases",
        placeholder:
          "What makes this query efficient or inefficient at scale?\n" +
          "What edge cases must be handled?\n\n" +
          "Common edge cases for database queries:\n" +
          "• NULL values — does COUNT(*) vs COUNT(column) matter here?\n" +
          "• Duplicate rows — does DISTINCT or GROUP BY affect correctness?\n" +
          "• Empty tables — does the query return sensible results on empty input?\n" +
          "• Large result sets — is pagination needed? (LIMIT/OFFSET or cursor?)\n" +
          "• Timezone handling — are DATETIME comparisons timezone-aware?\n\n" +
          "Scale considerations:\n" +
          "• At 1M rows this query runs in ~50ms. At 100M rows without the index it is ~8s.\n" +
          "• Could this be rewritten as a CTE to improve readability with same performance?\n" +
          "• Is there a window function version that avoids a self-join?\n\n" +
          "Write your optimization analysis:",
        hint: "The difference between a query that works and a query that works in production is exactly what this section captures.",
        rows: 8,
        required: false,
      },
      // ── Schema design problem fields ──────────────────────────────
      schemaDesign: {
        label: "Schema Design",
        placeholder:
          "Design the database schema for the stated requirements.\n\n" +
          "Format — define each table with columns, types, and constraints:\n\n" +
          "users\n" +
          "  id          BIGINT PRIMARY KEY AUTO_INCREMENT\n" +
          "  email       VARCHAR(255) UNIQUE NOT NULL\n" +
          "  name        VARCHAR(100) NOT NULL\n" +
          "  created_at  TIMESTAMP DEFAULT NOW()\n\n" +
          "orders\n" +
          "  id          BIGINT PRIMARY KEY AUTO_INCREMENT\n" +
          "  user_id     BIGINT NOT NULL REFERENCES users(id)\n" +
          "  status      ENUM('pending', 'paid', 'shipped', 'delivered') NOT NULL\n" +
          "  total_cents INT NOT NULL  -- store money as cents, never FLOAT\n" +
          "  created_at  TIMESTAMP DEFAULT NOW()\n" +
          "  INDEX(user_id)  -- explicit index for FK join\n\n" +
          "KEY DECISIONS TO EXPLAIN:\n" +
          "• Why VARCHAR(255) for email vs TEXT?\n" +
          "• Why store money as INT cents instead of DECIMAL or FLOAT?\n" +
          "• Why ENUM for status vs a lookup table?\n" +
          "• What normalization form is this and why is it appropriate?\n\n" +
          "Write your schema:",
        hint: "Schema design is tested at every company that does a database round. The interviewers are not just checking if it works — they are checking if you can explain WHY each type, constraint, and index decision was made.",
        rows: 16,
        required: true,
      },
      normalizationReasoning: {
        label: "Normalization & Design Decisions",
        placeholder:
          "Explain the key design decisions in your schema.\n\n" +
          "For each significant decision, follow this format:\n" +
          "Decision → What you chose → Why → Trade-off\n\n" +
          "Strong example:\n" +
          '"1. Normalization level: 3NF\n' +
          "   → Separated user data from order data into distinct tables\n" +
          "   → A user's name appears once in users, not duplicated in every order row\n" +
          "   → Trade-off: queries require JOINs vs denormalized single-table scan\n" +
          "   → Justified because user updates should not require updating order rows\n\n" +
          "2. Order status: ENUM vs lookup table\n" +
          "   → Chose ENUM for simplicity at this scale\n" +
          "   → Trade-off: adding a new status requires ALTER TABLE (DDL change)\n" +
          "   → Would choose a lookup table at scale where status values are dynamic\n\n" +
          "3. No soft deletes on orders\n" +
          "   → Orders should be immutable once paid (compliance, audit trail)\n" +
          "   → If cancellation is needed, add a 'cancelled' status, not a deleted_at\n" +
          '   → Soft deletes on financial records create regulatory complexity"\n\n' +
          "Write your design reasoning:",
        hint: "This section is the difference between a schema that was written and a schema that was designed. Interviewers at senior levels weight this heavily.",
        rows: 10,
        required: false,
      },
      indexDesign: {
        label: "Index Design for This Schema",
        placeholder:
          "What indexes do you create on this schema and why?\n\n" +
          "Match your indexes to your access patterns:\n\n" +
          'Access pattern: "Get all orders for a user"\n' +
          "→ CREATE INDEX idx_orders_user_id ON orders(user_id);\n" +
          "→ Without this: full table scan on orders per user lookup\n\n" +
          'Access pattern: "Get orders by status for fulfillment queue"\n' +
          "→ CREATE INDEX idx_orders_status ON orders(status) WHERE status = 'paid';\n" +
          "   (partial index — only indexes the rows that matter for this query)\n\n" +
          'Access pattern: "Get recent orders"\n' +
          "→ orders(created_at DESC) — B-Tree supports range and sort efficiently\n\n" +
          "What NOT to index:\n" +
          "→ Do not index low-cardinality columns (boolean, small ENUM)\n" +
          "   The query planner will often prefer a full scan over an index\n" +
          "   on a column with only 2-5 distinct values\n\n" +
          "Write your index design:",
        hint: "Index design without access patterns is guessing. Always name the query pattern that justifies each index.",
        rows: 10,
        required: false,
      },
      noSQLConsideration: {
        label: "NoSQL Consideration (Optional)",
        placeholder:
          "Would any part of this schema benefit from a non-relational store?\n\n" +
          "Strong example:\n" +
          '"The orders table is a good candidate for relational storage — structured,\n' +
          " transactional, and requires ACID compliance for financial data.\n\n" +
          " However, order_events (audit log of status changes) could live in a\n" +
          " document store like MongoDB or an append-only log like Kafka:\n" +
          " • Event data is semi-structured and schema-less\n" +
          " • It is append-only — no updates or deletes\n" +
          ' • Query patterns are time-series: "all events for order X" not JOINs\n' +
          " • At scale, the event log grows faster than the relational data\n\n" +
          " I would keep core order data in PostgreSQL and pipe events to\n" +
          ' Kafka → ClickHouse for analytics."\n\n' +
          "If the schema is purely relational with no NoSQL benefit, say so and why.",
        hint: "This section differentiates candidates who understand the full data architecture landscape. Not every schema needs NoSQL — but knowing when it would help is a strong signal.",
        rows: 8,
        required: false,
      },
    },
    // For solution display card — how to render submitted Database answers.
    // Two display configs — one per problem type.
    displayConfig: {
      query: [
        { key: "queryApproach", label: "Query Approach", icon: "🧠" },
        {
          key: "sqlQuery",
          label: "SQL Query",
          icon: "🗄️",
          isCode: true,
          language: "sql",
        },
        { key: "indexStrategy", label: "Index Strategy", icon: "⚡" },
        {
          key: "optimizationNotes",
          label: "Optimization & Edge Cases",
          icon: "⚖️",
        },
      ],
      schemaDesign: [
        {
          key: "schemaDesign",
          label: "Schema Design",
          icon: "🗄️",
          isCode: true,
        },
        {
          key: "normalizationReasoning",
          label: "Design Decisions",
          icon: "🧠",
        },
        { key: "indexDesign", label: "Index Design", icon: "⚡" },
        { key: "noSQLConsideration", label: "NoSQL Consideration", icon: "⚖️" },
      ],
    },
    showFollowUps: true,
    showSolutionTabs: false,
  },
};

/**
 * Get the form config for a given category
 */
export function getCategoryForm(category) {
  return CATEGORY_FORMS[category] || CATEGORY_FORMS.CODING;
}
