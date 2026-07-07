// client/src/pages/docs/howto/content/member/design-studio-lld.jsx
//
// Ripped verbatim from HowToPage.jsx #ds-lld section.
import {
    SummaryBlock, PrereqList, StepCard, HowToImage, Callout, PasteBlock, K,
    BRAND, SUCCESS,
} from '../../components'

export default function DesignStudioLldGuide() {
    return (
        <>
            <SummaryBlock>
                End-to-end walkthrough for a Low-Level Design session in Design Studio. Example:
                designing a Parking Lot — covers inheritance vs composition, Strategy pattern, SRP, and OOP thinking.
            </SummaryBlock>

            <PrereqList items={[
                'You are enrolled on a team (or on your personal auto-team).',
                'A LOW_LEVEL_DESIGN problem in your team’s problem bank if you want the coached entry path.',
            ]} />

            <StepCard num="0" {...BRAND} title="Create the session" sub="Same two entry points as System Design">
                <p className="text-xs text-text-secondary leading-relaxed">
                    <strong>From a problem:</strong> open an LLD problem from Problems → click <strong>🔧 Practice in Design Studio</strong>. Hub shows past attempts + <strong>Start Practice Session</strong>.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    <strong>Freeform:</strong> sidebar <K>Design Studio</K> → <strong>+ New Session</strong> → <strong>🔧 Low-Level Design</strong>, title <K>Design Parking Lot</K>, difficulty <K>MEDIUM</K>.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    Six phases instead of seven: Requirements → Entities → Hierarchy → Patterns → Methods → SOLID.
                </p>
                <p className="text-xs text-text-secondary leading-relaxed mt-2">
                    <strong>Workspace layout is identical to SD:</strong> Excalidraw canvas + phase editor on the
                    left (resizable), pinned right rail with AI Coach (Coach + History tabs), Data Flow, and
                    Component Annotations panels. The Stuck Detector, Reference Compare (post-eval), and
                    Practice as Interview entry points all behave the same way — see steps 7a, 7b, 11, 12 in the
                    Design Studio — System Design guide.
                </p>
                <HowToImage
                    file="ds-lld-00-create-session.png"
                    alt="Create-session screen with Low-Level Design type selected"
                    caption="Create-session screen with LLD selected — placeholder suggests classic LLD titles"
                />
            </StepCard>

            <StepCard num="1" {...BRAND} title="Requirements 📋">
                <PasteBlock>{`Functional:
- Multi-level parking lot with different spot sizes (compact, regular, large, motorcycle)
- Vehicle types: Car, Truck, Motorcycle — each needs matching spot
- Entry: issue ticket with entry time + assigned spot
- Exit: calculate fee based on duration + vehicle type
- Payment: cash or card (extensible to more types)
- Track free spots in real time; reject entry when full

Non-functional:
- Concurrent entries possible (multiple gates)
- Spot assignment must be thread-safe
- Fee calculation must be easy to change without touching core code`}</PasteBlock>
            </StepCard>

            <StepCard num="2" {...BRAND} title="Entities 📦" sub="Identify classes with single responsibilities">
                <PasteBlock>{`ParkingLot — top-level, has Floors, handles entry/exit
Floor — has ParkingSpots
ParkingSpot (abstract) → CompactSpot, RegularSpot, LargeSpot, MotorcycleSpot
Vehicle (abstract) → Car, Truck, Motorcycle
Ticket — entryTime, spot, vehicle
PaymentStrategy (interface) → CashPayment, CardPayment
FeeStrategy (interface) → FlatRateFee, TieredByVehicleFee
SpotAssignmentStrategy (interface) → NearestFirst, FillByFloor

SRP check:
- ParkingLot orchestrates entry/exit; delegates pricing, assignment, payment
- Ticket is a pure data carrier (no logic)
- Each Strategy has exactly one responsibility`}</PasteBlock>
            </StepCard>

            <StepCard num="3" {...BRAND} title="Class Hierarchy 🗂️" sub="IS-A vs HAS-A decisions">
                <PasteBlock>{`Vehicle (abstract):
  - licensePlate: String
  - type: VehicleType
  - getSpotSizeNeeded(): SpotSize   ← each subclass implements
Car → REGULAR, Truck → LARGE, Motorcycle → MOTORCYCLE

ParkingSpot (abstract):
  - id, size, isOccupied
  - canFit(Vehicle): boolean       ← template method
  - assign(Vehicle) / release()    ← synchronized

IS-A vs HAS-A:
- Car IS-A Vehicle (inheritance — shared behavior)
- ParkingLot HAS-A list of Floor (composition — lot isn't a floor)
- Floor HAS-A list of ParkingSpot

Avoided: making ParkingLot extend Floor.`}</PasteBlock>
            </StepCard>

            <StepCard num="4" {...BRAND} title="Design Patterns 🧩" sub="Which patterns, structurally justified">
                <PasteBlock>{`Strategy (3 uses):
- FeeStrategy → swap pricing rules without changing ParkingLot
- PaymentStrategy → swap payment method
- SpotAssignmentStrategy → swap spot-finding algorithm
Why Strategy: pluggable algorithms with a common interface.

Factory:
- VehicleFactory.fromScanInput(scanData) → Car / Truck / Motorcycle
- Centralizes instantiation logic, keeps entry() clean

Observer:
- DisplayBoard observes ParkingLot for free-spot-count changes
- Decouples display from core logic

Singleton:
- ParkingLot itself — only one per app
- Prefer dependency injection over static getInstance() for testability`}</PasteBlock>
            </StepCard>

            <StepCard num="5" {...BRAND} title="Method Signatures 💻" sub="Core operations, method-level">
                <PasteBlock>{`class ParkingLot {
    private final List<Floor> floors;
    private final SpotAssignmentStrategy assignStrategy;
    private final FeeStrategy feeStrategy;

    public synchronized Ticket enter(Vehicle v) throws LotFullException {
        ParkingSpot spot = assignStrategy.findSpot(floors, v);
        if (spot == null) throw new LotFullException();
        spot.assign(v);
        return new Ticket(v, spot, Instant.now());
    }

    public Receipt exit(Ticket t, PaymentStrategy payment) {
        Duration stay = Duration.between(t.entryTime, Instant.now());
        Money fee = feeStrategy.calculate(t.vehicle, stay);
        payment.charge(fee);
        t.spot.release();
        return new Receipt(t, fee, payment.method());
    }
}`}</PasteBlock>
            </StepCard>

            <StepCard num="6" {...BRAND} title="SOLID Analysis 🏛️" sub="Per-principle, honest about violations">
                <PasteBlock>{`S — Single Responsibility
✅ ParkingLot orchestrates. Strategies handle one concern each. Ticket is pure data.

O — Open/Closed
✅ New vehicle type: subclass Vehicle, override getSpotSizeNeeded(). No change to ParkingLot.
✅ New pricing: implement FeeStrategy, inject. No change to exit().

L — Liskov Substitution
✅ Any Vehicle subclass works wherever Vehicle is expected.
⚠️ Motorcycle can fit a RegularSpot — intentional relaxation, documented.

I — Interface Segregation
✅ FeeStrategy, PaymentStrategy, SpotAssignmentStrategy are small (1 method each).

D — Dependency Inversion
✅ ParkingLot depends on FeeStrategy interface, not concrete class.
✅ Makes unit testing trivial: inject MockFeeStrategy.

Honest violation I admit:
- ParkingLot.enter() uses method-level synchronized — pessimistic.
  Better: CAS on individual spots. Acceptable V1, documented.`}</PasteBlock>
            </StepCard>

            <StepCard num="7" {...BRAND} title="Components + Data Flow" sub="Right-rail panels, same as SD">
                <PasteBlock label="🧩 Component Annotations">{`ParkingLot — Orchestrator (Java class)
FeeStrategy — Pricing abstraction (interface + impls)
SpotAssignmentStrategy — Finds free spot (interface + impls)
DisplayBoard — Shows free count, observes ParkingLot`}</PasteBlock>
                <PasteBlock label="🔀 Data Flow">{`Entry: Scanner → VehicleFactory.fromScanInput() → ParkingLot.enter(vehicle)
  → SpotAssignmentStrategy.findSpot() → ParkingSpot.assign() → Ticket returned
  → DisplayBoard observer updated

Exit: Scanner reads ticket → ParkingLot.exit(ticket, payment)
  → FeeStrategy.calculate() → payment.charge() → spot.release() → Receipt returned`}</PasteBlock>
            </StepCard>

            <StepCard num="8" {...SUCCESS} title="Validate + Final Evaluation" sub="Scenarios probe OOP concerns">
                <p className="text-xs text-text-secondary leading-relaxed mb-2">
                    <strong>Validate Design →</strong> will generate scenarios like: &ldquo;What if two entries happen at the
                    same instant for the last spot?&rdquo;, &ldquo;Add a new EV vehicle type that needs charging —
                    does the design break?&rdquo;, &ldquo;What if payment fails after the spot is released?&rdquo;
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                    Answer each by tracing through your classes. Then <strong>Get Final Evaluation</strong> —
                    LLD evaluation scores different dimensions: entityIdentification, hierarchyCorrectness,
                    patternApplication, solidCompliance, implementationQuality, extensibilityScore, edgeCaseAwareness.
                </p>
                <HowToImage
                    file="ds-lld-08-evaluation.png"
                    alt="LLD final evaluation page with OOP-specific dimensions (Entities, Hierarchy, Patterns, SOLID, Implementation, Extensibility, Edge Cases)"
                    caption="LLD evaluation — note the OOP-specific dimension labels"
                />
            </StepCard>

            <Callout type="info">
                <strong>Tip for both tracks:</strong> don&apos;t skip the Data Flow panel — the AI can&apos;t see
                your Excalidraw. Without it, scenario and evaluation quality drops a lot.
            </Callout>

            <Callout type="success">
                <strong>Post-eval, both tracks unlock:</strong>
                <ul className="mt-2 space-y-1 list-disc pl-4">
                    <li><strong>🧭 Reference</strong> — side-by-side compare against a curated worked example with key-term diff (gated until evaluation completes).</li>
                    <li><strong>🎤 Practice as Interview</strong> — same canvas, AI plays interviewer, can read your live diagram via tool calls. Best after one self-paced attempt.</li>
                </ul>
            </Callout>
        </>
    )
}
