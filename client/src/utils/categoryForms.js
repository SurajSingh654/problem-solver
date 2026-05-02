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
        label: "Extensibility",
        icon: "🔬",
        desc: "SOLID principles, trade-offs, and what changes next",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Design Pattern Used",
        placeholder: "e.g. Strategy, Factory, Observer, Decorator, Command...",
        show: true,
        suggestions: [
          "Factory",
          "Abstract Factory",
          "Singleton",
          "Builder",
          "Prototype",
          "Adapter",
          "Decorator",
          "Facade",
          "Proxy",
          "Observer",
          "Strategy",
          "Command",
          "State",
          "Iterator",
          "Template Method",
          "Chain of Responsibility",
          "Composite",
          "None — vanilla OOP",
        ],
      },
      patternReasoning: {
        label: "Entity Identification",
        placeholder:
          "What are the core entities?\n\nFor a Parking Lot:\n• ParkingLot, ParkingFloor, ParkingSpot\n• Vehicle (Car, Truck, Motorcycle)\n• Ticket, Payment\n• EntrancePanel, ExitPanel\n\nFor each entity: what are its responsibilities?",
        hint: "Start here before writing any code. Wrong entity identification = wrong design.",
        show: true,
      },
      keyInsight: {
        label: "Key Design Decision",
        placeholder: "The most important OOP/design choice you made and why...",
        hint: "e.g. 'Used Strategy pattern for parking fee calculation so new vehicle types don't require changing ParkingLot class (Open/Closed Principle)'",
        show: true,
      },
      simpleExplanation: {
        label: "SOLID Principles Applied",
        placeholder:
          "Which SOLID principles are satisfied by your design? Give a specific example for each that applies:\n\nS — Single Responsibility: Each class has one reason to change\nO — Open/Closed: Open for extension, closed for modification\nL — Liskov Substitution: Subtypes are substitutable for base types\nI — Interface Segregation: No class implements unused methods\nD — Dependency Inversion: Depend on abstractions, not concretions",
        show: true,
      },
      challenges: {
        label: "Extensibility Analysis",
        placeholder:
          "How does your design handle these common follow-up requirements?\n\n• Add a new vehicle type\n• Change the fee calculation logic\n• Add a new payment method\n• Add a reservation system\n• Support multiple parking lot locations\n\nIf any of these require changing existing classes, where does your design break?",
        show: true,
      },
    },
    showSolutionTabs: true,
    solutionTabConfig: {
      types: [
        { id: "BRUTE_FORCE", label: "Initial Design", icon: "📐" },
        { id: "OPTIMIZED", label: "Refined Design", icon: "✨" },
        { id: "ALTERNATIVE", label: "Alternative Approach", icon: "🔄" },
      ],
      approachLabel: "Class Hierarchy Description",
      approachPlaceholder:
        "Describe your class structure:\n\nabstract class Vehicle\n  + licensePlate: String\n  + type: VehicleType\n  + getType(): VehicleType\n\nclass Car extends Vehicle\nclass Truck extends Vehicle\nclass Motorcycle extends Vehicle\n\ninterface ParkingStrategy\n  + calculateFee(ticket: Ticket): double\n\nclass HourlyParkingStrategy implements ParkingStrategy\nclass FlatRateParkingStrategy implements ParkingStrategy",
      complexityLabels: {
        time: "Number of Classes / Interfaces",
        space: "Memory per Instance",
      },
      codeLabel: "Implementation",
      codePlaceholder:
        "// Write your class implementation\n// Focus on: constructors, key methods, and relationships\n\npublic abstract class Vehicle {\n    private String licensePlate;\n    private VehicleType type;\n    \n    public Vehicle(String licensePlate, VehicleType type) {\n        this.licensePlate = licensePlate;\n        this.type = type;\n    }\n    \n    public abstract VehicleType getType();\n}",
      notesLabel: "Design Notes",
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
    steps: [
      {
        id: 1,
        label: "Analysis",
        icon: "🔍",
        desc: "What is the interviewer really asking?",
      },
      {
        id: 2,
        label: "Response",
        icon: "💬",
        desc: "Your authentic, specific answer",
      },
      {
        id: 3,
        label: "Research",
        icon: "🏢",
        desc: "Company connection and preparation",
      },
    ],
    fields: {
      patternIdentified: {
        label: "Question Category",
        placeholder: "e.g. Motivation, Career Goals, Strengths, Culture Fit...",
        show: true,
        suggestions: [
          "Motivation & Why",
          "Career Goals",
          "Strengths & Weaknesses",
          "Culture Fit",
          "Salary Expectations",
          "Work Style",
          "Why Leaving",
          "Why This Role",
        ],
      },
      patternReasoning: {
        label: "What Are They Really Asking?",
        placeholder:
          "Behind every HR question is a real concern. What is the interviewer trying to assess?",
        hint: '"Why should we hire you?" = "Can you articulate your unique value?"',
        show: true,
      },
      keyInsight: {
        label: "Your Core Message",
        placeholder: "One sentence that captures the essence of your answer.",
        hint: "Every great HR answer has a clear, memorable takeaway.",
        show: true,
      },
      simpleExplanation: {
        label: "Your Answer",
        placeholder:
          "Write your complete, polished response. Be authentic and specific.",
        hint: "Avoid generic answers — mention specific projects, numbers, or experiences.",
        show: true,
      },
      challenges: {
        label: "Company Research Connection",
        placeholder:
          "How does your answer connect specifically to THIS company?",
        hint: "Mention their mission, recent news, product, or values.",
        show: true,
      },
    },
    showSolutionTabs: false,
    showFollowUps: false,
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
