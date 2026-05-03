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
    steps: [
      {
        id: 1,
        label: "Context",
        icon: "📖",
        desc: "Set the scene — Situation and Task",
      },
      {
        id: 2,
        label: "Response",
        icon: "🎯",
        desc: "What you did — Action steps",
      },
      {
        id: 3,
        label: "Reflection",
        icon: "🔬",
        desc: "Impact, metrics, and learnings",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Question Type",
        placeholder:
          "e.g. Leadership, Conflict Resolution, Failure, Initiative...",
        show: true,
        suggestions: [
          "Leadership",
          "Conflict Resolution",
          "Failure & Learning",
          "Initiative & Ownership",
          "Teamwork",
          "Time Management",
          "Technical Challenge",
          "Disagreement",
          "Ambiguity",
          "Customer Focus",
        ],
      },
      patternReasoning: {
        label: "STAR — Situation & Task",
        placeholder:
          "Set the context. What was the situation? What was your specific role and task?",
        hint: "Be specific — name the project, team size, timeline, stakes.",
        show: true,
      },
      keyInsight: {
        label: "Key Learning",
        placeholder:
          "What did you learn from this experience? How did it change your approach?",
        hint: "Interviewers want growth mindset — show what you'd do differently.",
        show: true,
      },
      simpleExplanation: {
        label: "STAR — Result & Impact",
        placeholder:
          "What was the outcome? Include metrics if possible (%, $, time saved).",
        hint: 'Quantify whenever you can — "reduced deploy time by 40%".',
        show: true,
      },
      challenges: {
        label: "What Would You Do Differently?",
        placeholder: "If you faced this again, what would you change?",
        show: true,
      },
    },
    showSolutionTabs: false,
    showActionSection: true,
    actionField: {
      label: "STAR — Action (Step by Step)",
      placeholder:
        "What specific steps did you take? Be detailed — this is the core of your answer.",
      hint: 'Use "I" not "we" — interviewers want YOUR actions.',
    },
    showFollowUps: true,
  },
  CS_FUNDAMENTALS: {
    steps: [
      {
        id: 1,
        label: "Concept",
        icon: "📚",
        desc: "Explain the concept in your own words",
      },
      {
        id: 2,
        label: "Details",
        icon: "🔍",
        desc: "Examples, edge cases, and misconceptions",
      },
      {
        id: 3,
        label: "Application",
        icon: "🌍",
        desc: "Real-world usage and interview talking points",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Core Topic",
        placeholder: "e.g. Virtual Memory, TCP Handshake, B-Tree Indexing...",
        show: true,
      },
      patternReasoning: {
        label: "Concept Explanation",
        placeholder:
          "Explain this concept clearly in your own words. Imagine teaching it to a junior developer.",
        hint: 'Start with the "what", then the "why", then the "how".',
        show: true,
      },
      keyInsight: {
        label: "Key Distinction",
        placeholder:
          "What's the one thing that separates deep understanding from surface knowledge?",
        hint: "The subtle detail that interviewers test for.",
        show: true,
      },
      simpleExplanation: {
        label: "Real-World Examples",
        placeholder:
          "Where is this concept used in real systems? Give 2-3 concrete examples.",
        show: true,
      },
      challenges: {
        label: "Common Misconceptions",
        placeholder:
          "What do most people get wrong about this? What tripped you up?",
        show: true,
      },
    },
    showSolutionTabs: false,
    showDetailSection: true,
    detailField: {
      label: "Detailed Breakdown",
      placeholder:
        "Walk through the concept step by step. Include diagrams in text form if helpful.",
      hint: "Use examples, edge cases, and comparisons with related concepts.",
    },
    showFollowUps: true,
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
    steps: [
      {
        id: 1,
        label: "Understanding",
        icon: "📋",
        desc: "Analyze the schema and requirements",
      },
      {
        id: 2,
        label: "Solution",
        icon: "🗄️",
        desc: "Write and explain your query",
      },
      {
        id: 3,
        label: "Optimization",
        icon: "⚡",
        desc: "Index strategy, performance, edge cases",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Query Pattern",
        placeholder:
          "e.g. JOIN, Subquery, Window Function, CTE, Aggregation...",
        show: true,
        suggestions: [
          "JOIN",
          "Subquery",
          "Window Function",
          "CTE",
          "Aggregation",
          "GROUP BY",
          "HAVING",
          "UNION",
          "EXISTS",
          "Recursive CTE",
        ],
      },
      patternReasoning: {
        label: "Schema Analysis",
        placeholder:
          "What tables are involved? What are the relationships? What does the query need to return?",
        hint: "Understanding the schema is 50% of writing the correct query.",
        show: true,
      },
      keyInsight: {
        label: "Key Optimization",
        placeholder:
          "What index would you add? What makes this query efficient or inefficient?",
        hint: "Think about: index strategy, query plan, N+1 problems.",
        show: true,
      },
      simpleExplanation: {
        label: "Query Explanation",
        placeholder:
          "Walk through your query step by step. Why each JOIN, WHERE, GROUP BY?",
        show: true,
      },
      challenges: {
        label: "Edge Cases",
        placeholder:
          "NULL values, empty tables, duplicate rows, large datasets...",
        show: true,
      },
    },
    showSolutionTabs: true,
    solutionTabConfig: {
      types: [
        { id: "BRUTE_FORCE", label: "Basic Query", icon: "🐌" },
        { id: "OPTIMIZED", label: "Optimized Query", icon: "⚡" },
        { id: "ALTERNATIVE", label: "Alternative", icon: "🔄" },
      ],
      approachLabel: "Query Approach",
      approachPlaceholder: "Describe what your query does at a high level...",
      complexityLabels: {
        time: "Time Complexity",
        space: "Space / Index Cost",
      },
      codeLabel: "SQL Query",
      codePlaceholder:
        "-- Write your SQL query here\n\nSELECT\n  u.name,\n  COUNT(o.id) AS order_count\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id\nHAVING COUNT(o.id) > 5\nORDER BY order_count DESC;",
      defaultLanguage: "SQL",
      notesLabel: "Query Notes",
    },
    showFollowUps: true,
  },
};

/**
 * Get the form config for a given category
 */
export function getCategoryForm(category) {
  return CATEGORY_FORMS[category] || CATEGORY_FORMS.CODING;
}
