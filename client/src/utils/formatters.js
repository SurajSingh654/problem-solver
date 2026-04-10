/**
 * FORMATTERS — Date, number, string utilities
 */
import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

// ── Date formatters ────────────────────────────────

export function formatRelativeDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function formatShortDate(dateString) {
  if (!dateString) return "—";
  return format(new Date(dateString), "MMM d, yyyy");
}

export function formatCompactDate(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  const diff = Math.floor((Date.now() - date) / 86400000);
  if (diff < 7) return `${diff}d ago`;
  return format(date, "MMM d");
}

export function formatFullDate(dateString) {
  if (!dateString) return "—";
  return format(new Date(dateString), "EEEE, MMMM d, yyyy");
}

export function formatCountdown(targetDate) {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.ceil((target - today) / 86400000);
  if (days < 0) return null;
  if (days === 0) return "Interview today!";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

// ── Number formatters ──────────────────────────────

export function formatNumber(n) {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function formatPercent(value, total) {
  if (!total) return "0%";
  return Math.round((value / total) * 100) + "%";
}

export function formatDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ── String formatters ──────────────────────────────

export function getInitials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

export function truncate(str, maxLength = 100) {
  if (!str || str.length <= maxLength) return str || "";
  return str.slice(0, maxLength).trim() + "…";
}

export function capitalise(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function slugify(str = "") {
  return str
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

// ── Score formatters ───────────────────────────────

export function formatScore(score) {
  if (score === null || score === undefined) return "—";
  return Math.round(score) + "/100";
}

export function getScoreColor(score) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-brand-300";
  if (score >= 40) return "text-warning";
  return "text-danger";
}

export function getScoreLabel(score) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Developing";
  if (score >= 40) return "Needs Work";
  return "Getting Started";
}
