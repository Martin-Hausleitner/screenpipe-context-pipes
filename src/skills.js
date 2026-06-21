import fs from "node:fs";
import path from "node:path";
import { expandHome } from "./config.js";

const SKILL_FILE_NAMES = ["SKILL.md", "README.md", "skill.md"];

export function inventorySkills(roots, { includeBodies = false } = {}) {
  const byId = new Map();
  for (const rootValue of roots || []) {
    const root = expandHome(rootValue);
    if (!root || !fs.existsSync(root)) continue;
    for (const dirent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dirent.isDirectory()) continue;
      const skillDir = path.join(root, dirent.name);
      const file = SKILL_FILE_NAMES.map((name) => path.join(skillDir, name)).find((p) =>
        fs.existsSync(p),
      );
      const text = file ? fs.readFileSync(file, "utf8") : "";
      const title = firstHeading(text) || dirent.name;
      const description = frontmatterValue(text, "description") || firstParagraph(text);
      const tags = inferSkillTags(`${dirent.name}\n${title}\n${description}`);
      const skill = {
        id: dirent.name,
        root,
        title,
        description,
        tags,
        ...(includeBodies ? { body: text.slice(0, 4000) } : {}),
      };
      const existing = byId.get(skill.id);
      if (!existing || scoreSkill(skill) > scoreSkill(existing)) {
        byId.set(skill.id, skill);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function scoreSkill(skill) {
  return Number(Boolean(skill.description)) + Number(Boolean(skill.title)) + (skill.tags || []).length;
}

function firstHeading(text) {
  const match = text.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function firstParagraph(text) {
  const stripped = text.replace(/^---[\s\S]*?---\s*/m, "");
  const para = stripped
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s+/gm, "").trim())
    .find((p) => p && !p.startsWith("```"));
  return para ? para.slice(0, 240) : "";
}

function frontmatterValue(text, key) {
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return "";
  const re = new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m");
  const match = fm[1].match(re);
  return match ? match[1].trim() : "";
}

function inferSkillTags(text) {
  const lower = text.toLowerCase();
  const tags = [];
  for (const [tag, terms] of Object.entries({
    activitywatch: ["activitywatch", "activity watch"],
    whoop: ["whoop"],
    health: ["health", "apple health", "fitness"],
    obsidian: ["obsidian"],
    notion: ["notion"],
    photos: ["photos", "apple photos"],
    messaging: ["beeper", "slack", "discord", "imessage", "whatsapp"],
    browser: ["browser", "chrome", "brave", "comet"],
    finance: ["finance", "wise", "bank"],
  })) {
    if (terms.some((term) => lower.includes(term))) tags.push(tag);
  }
  return tags;
}
