// ============================================================================
// SuperAdmin Diagnostics Page — read-only health dashboard
// ============================================================================
//
// Single page. One server call. Categorized cards with findings. Each
// finding has severity (INFO/WARNING/ERROR) + a recommended fix. The
// "Refresh" button re-runs all checks server-side.
// ============================================================================
import { motion } from "framer-motion";
import { useDiagnostics, useRefetchDiagnostics } from "@hooks/useDiagnostics";
import { Button } from "@components/ui/Button";
import { Spinner } from "@components/ui/Spinner";
import { cn } from "@utils/cn";

const SEVERITY_STYLE = {
    ERROR: {
        icon: "🛑",
        label: "Error",
        chip: "bg-danger-soft text-danger-fg border-danger-line",
        cardBorder: "border-danger-line/60",
        dot: "bg-danger-fg",
    },
    WARNING: {
        icon: "⚠️",
        label: "Warning",
        chip: "bg-warning-soft text-warning-fg border-warning-line",
        cardBorder: "border-warning-line/60",
        dot: "bg-warning-fg",
    },
    INFO: {
        icon: "ℹ️",
        label: "Info",
        chip: "bg-brand-soft text-brand-fg-soft border-brand-line",
        cardBorder: "border-border-default",
        dot: "bg-brand-fg-soft",
    },
    OK: {
        icon: "✅",
        label: "OK",
        chip: "bg-success-soft text-success-fg border-success-line",
        cardBorder: "border-success-line/60",
        dot: "bg-success-fg",
    },
};

export default function SuperAdminDiagnosticsPage() {
    const { data, isLoading, isError, error, isFetching } = useDiagnostics();
    const refetch = useRefetchDiagnostics();

    return (
        <div className="max-w-[1100px] mx-auto p-6 space-y-5">
            <Header
                summary={data?.summary}
                generatedAt={data?.generatedAt}
                tookMs={data?.tookMs}
                env={data?.env}
                onRefresh={refetch}
                isFetching={isFetching}
            />

            {isLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <Spinner />
                    <p className="text-xs text-text-disabled">
                        Running diagnostics across AI, database, schema, runtime…
                    </p>
                </div>
            )}

            {isError && (
                <div className="p-4 rounded-xl bg-danger-soft border border-danger-line">
                    <p className="text-sm font-bold text-danger-fg mb-1">
                        Diagnostics request failed
                    </p>
                    <p className="text-xs text-text-secondary">
                        {error?.response?.data?.error?.message || error?.message}
                    </p>
                </div>
            )}

            {data?.categories?.map((cat) => (
                <CategoryCard key={cat.id} category={cat} />
            ))}
        </div>
    );
}

function Header({ summary, generatedAt, tookMs, env, onRefresh, isFetching }) {
    const overall = summary?.overallSeverity || "OK";
    const overallStyle = SEVERITY_STYLE[overall];

    return (
        <div className="rounded-xl bg-surface-1 border border-border-default p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-extrabold text-text-primary">
                        🩺 Platform Diagnostics
                    </h1>
                    <p className="text-xs text-text-tertiary mt-1">
                        Read-only runtime health checks. Run on demand; results are not cached.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {generatedAt && (
                        <span className="text-[10px] text-text-disabled">
                            Last run {new Date(generatedAt).toLocaleTimeString()} ({tookMs}ms)
                        </span>
                    )}
                    <Button onClick={onRefresh} disabled={isFetching}>
                        {isFetching ? "Running…" : "Refresh"}
                    </Button>
                </div>
            </div>

            {summary && (
                <div className="flex items-center gap-3 flex-wrap">
                    <SeverityBadge severity={overall} prominent />
                    <Stat
                        label="Errors"
                        value={summary.errors}
                        accent={summary.errors > 0 ? "danger" : "muted"}
                    />
                    <Stat
                        label="Warnings"
                        value={summary.warnings}
                        accent={summary.warnings > 0 ? "warning" : "muted"}
                    />
                    <Stat label="Info" value={summary.info} accent="muted" />
                </div>
            )}

            {env && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-border-subtle">
                    <EnvCell label="AI" value={env.aiEnabled ? "enabled" : "disabled"} />
                    <EnvCell label="Daily limit" value={env.aiDailyLimit} />
                    <EnvCell label="Fast model" value={env.modelFast} mono />
                    <EnvCell label="Premium model" value={env.modelPremium} mono />
                </div>
            )}
            {/* overallStyle is referenced for type compat; nothing to render here */}
            <span className="hidden">{overallStyle.label}</span>
        </div>
    );
}

function CategoryCard({ category }) {
    const style = SEVERITY_STYLE[category.severity] || SEVERITY_STYLE.OK;
    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "rounded-xl bg-surface-1 border p-5 space-y-3",
                style.cardBorder,
            )}
        >
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-extrabold text-text-primary flex items-center gap-2">
                    <span>{category.icon}</span>
                    {category.label}
                </h2>
                <SeverityBadge severity={category.severity} />
            </div>

            <ul className="space-y-2">
                {category.findings.map((f) => (
                    <FindingItem key={f.id} finding={f} />
                ))}
            </ul>
        </motion.div>
    );
}

function FindingItem({ finding }) {
    const style = SEVERITY_STYLE[finding.severity] || SEVERITY_STYLE.INFO;
    return (
        <li className="flex items-start gap-3 p-3 rounded-lg bg-surface-2">
            <div className="flex-shrink-0 pt-0.5">
                <span className="text-base" aria-label={style.label}>
                    {style.icon}
                </span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-bold text-text-primary leading-snug">
                    {finding.title}
                </p>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                    {finding.detail}
                </p>
                {finding.recommendedFix && (
                    <p className="text-[11px] text-text-tertiary leading-relaxed pt-1 border-t border-border-subtle">
                        <span className="font-bold text-brand-fg-soft">
                            Recommended:{" "}
                        </span>
                        {finding.recommendedFix}
                    </p>
                )}
            </div>
        </li>
    );
}

function SeverityBadge({ severity, prominent = false }) {
    const style = SEVERITY_STYLE[severity] || SEVERITY_STYLE.OK;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-md border font-bold uppercase tracking-widest",
                prominent
                    ? "px-3 py-1.5 text-[11px]"
                    : "px-2 py-0.5 text-[9px]",
                style.chip,
            )}
        >
            <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
            {style.label}
        </span>
    );
}

function Stat({ label, value, accent }) {
    const accentClass = {
        danger: "text-danger-fg",
        warning: "text-warning-fg",
        muted: "text-text-secondary",
    }[accent];
    return (
        <div className="flex items-baseline gap-1.5">
            <span className={cn("text-lg font-extrabold tabular-nums", accentClass)}>
                {value}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-text-disabled">
                {label}
            </span>
        </div>
    );
}

function EnvCell({ label, value, mono }) {
    return (
        <div className="space-y-0.5">
            <p className="text-[10px] uppercase tracking-widest text-text-disabled">
                {label}
            </p>
            <p
                className={cn(
                    "text-xs font-bold text-text-primary truncate",
                    mono && "font-mono",
                )}
                title={String(value)}
            >
                {String(value)}
            </p>
        </div>
    );
}
