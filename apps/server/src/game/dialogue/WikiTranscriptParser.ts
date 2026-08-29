import {
    validateDialogueTreeJson,
    type DialogueStep,
    type DialogueTreeJson,
} from "@server/game/dialogue/DialogueTree";

export interface WikiTranscriptSource {
    pageTitle: string;
    displayTitle: string;
    revisionId: number;
    url: string;
    retrievedAt: string;
}

export interface WikiTranscriptUnresolvedHook {
    path: string;
    kind: "action" | "condition" | "reference" | "structure";
    text: string;
    wikitext: string;
}

export interface WikiTranscriptSectionDraft {
    heading: string;
    status: "ready" | "needs-review";
    tree: DialogueTreeJson;
    speakers: string[];
    unresolved: WikiTranscriptUnresolvedHook[];
}

export interface WikiTranscriptDraft {
    format: "august-wiki-dialogue-draft-v1";
    source: WikiTranscriptSource;
    notice: string;
    suggestedNpcId?: number;
    sections: WikiTranscriptSectionDraft[];
}

interface BulletNode {
    content: string;
    raw: string;
    children: BulletNode[];
}

interface SectionSource {
    heading: string;
    bullets: BulletNode[];
}

interface ParseContext {
    unresolved: WikiTranscriptUnresolvedHook[];
    speakers: Set<string>;
}

export function parseWikiTranscript(
    wikitext: string,
    source: WikiTranscriptSource,
    options: { suggestedNpcId?: number; section?: string } = {},
): WikiTranscriptDraft {
    const requestedSection = options.section?.trim().toLowerCase();
    const sections = splitSections(wikitext)
        .filter((section) => !requestedSection || section.heading.toLowerCase() === requestedSection)
        .map((section) => parseSection(section))
        .filter((section) => section.tree.steps.length > 0 || section.unresolved.length > 0);

    return {
        format: "august-wiki-dialogue-draft-v1",
        source,
        notice:
            "Draft generated from an OSRS Wiki transcript. Review unresolved hooks and verify dialogue in-game before promoting it to runtime content. Transcript text is copied from Old School RuneScape and attributed by the source page.",
        ...(options.suggestedNpcId === undefined ? {} : { suggestedNpcId: options.suggestedNpcId }),
        sections,
    };
}

function parseSection(section: SectionSource): WikiTranscriptSectionDraft {
    const context: ParseContext = { unresolved: [], speakers: new Set<string>() };
    const steps = parseSequence(section.bullets, context, section.heading);
    const tree = { steps };
    for (const error of validateDialogueTreeJson(tree)) {
        context.unresolved.push({
            path: `${section.heading} > ${error.path}`,
            kind: "structure",
            text: error.message,
            wikitext: "",
        });
    }
    return {
        heading: section.heading,
        status: context.unresolved.length === 0 ? "ready" : "needs-review",
        tree,
        speakers: [...context.speakers].sort(),
        unresolved: context.unresolved,
    };
}

function splitSections(wikitext: string): SectionSource[] {
    const rawSections: Array<{ heading: string; lines: string[] }> = [];
    let current = { heading: "Main dialogue", lines: [] as string[] };
    rawSections.push(current);
    for (const line of wikitext.replace(/\r\n?/g, "\n").split("\n")) {
        const heading = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
        if (heading) {
            current = { heading: stripWikiMarkup(heading[2]), lines: [] };
            rawSections.push(current);
        } else {
            current.lines.push(line);
        }
    }
    return rawSections.map((section) => ({
        heading: section.heading,
        bullets: buildBulletTree(section.lines),
    }));
}

function buildBulletTree(lines: readonly string[]): BulletNode[] {
    const roots: BulletNode[] = [];
    const parents: BulletNode[] = [];
    for (const line of lines) {
        const match = line.match(/^(\*+)\s*(.*?)\s*$/);
        if (!match) continue;
        const depth = match[1].length;
        const node: BulletNode = { content: match[2], raw: line, children: [] };
        while (parents.length >= depth) parents.pop();
        const parent = parents[depth - 2];
        if (parent) parent.children.push(node);
        else roots.push(node);
        parents[depth - 1] = node;
    }
    return roots;
}

function parseSequence(nodes: readonly BulletNode[], context: ParseContext, path: string): DialogueStep[] {
    const steps: DialogueStep[] = [];
    let randomNext = false;
    for (let index = 0; index < nodes.length;) {
        const node = nodes[index];
        const template = parseTemplate(node.content);
        if (template?.name === "trandom") {
            randomNext = true;
            index += 1;
            continue;
        }
        if (template?.name === "tselect") {
            index += 1;
            continue;
        }
        if (template?.name === "topt") {
            const optionNodes: BulletNode[] = [];
            while (index < nodes.length && parseTemplate(nodes[index].content)?.name === "topt") {
                optionNodes.push(nodes[index]);
                index += 1;
            }
            if (randomNext || optionNodes.every((entry) => /^dialogue\s+\d+$/i.test(templateLabel(entry.content)))) {
                randomNext = false;
                if (optionNodes.length < 2) {
                    addUnresolved(context, path, "structure", "Random pool has fewer than two entries", optionNodes);
                    continue;
                }
                steps.push({
                    kind: "pool",
                    entries: optionNodes.map((entry, poolIndex) => ({
                        id: templateLabel(entry.content) || `Dialogue ${poolIndex + 1}`,
                        steps: parseSequence(entry.children, context, `${path} > pool ${poolIndex + 1}`),
                    })),
                });
                continue;
            }
            if (optionNodes.length < 2) {
                addUnresolved(context, path, "structure", `Single option '${templateLabel(node.content)}' needs manual context`, optionNodes);
                continue;
            }
            steps.push({
                kind: "options",
                options: optionNodes.map((entry, optionIndex) => ({
                    label: templateLabel(entry.content) || `Option ${optionIndex + 1}`,
                    steps: parseSequence(entry.children, context, `${path} > option ${optionIndex + 1}`),
                })),
            });
            continue;
        }

        const spoken = parseSpokenLine(node.content);
        if (spoken) {
            context.speakers.add(spoken.name);
            steps.push({ kind: "line", speaker: spoken.isPlayer ? "player" : "npc", text: [spoken.text] });
            index += 1;
            continue;
        }

        if (template?.name === "tact" && template.positional[0]?.toLowerCase() === "end") {
            index += 1;
            continue;
        }
        if (template?.name === "tcond") {
            addUnresolved(context, path, "condition", template.positional[0] || "Conditional branch", [node]);
            index += 1;
            continue;
        }
        if (template?.name === "qact" || template?.name === "tact") {
            const text = describeActionTemplate(template);
            const kind = /\babove\b/i.test(text) ? "reference" : "action";
            addUnresolved(context, path, kind, text, [node]);
            index += 1;
            continue;
        }

        if (node.children.length > 0) {
            addUnresolved(context, path, "structure", stripWikiMarkup(node.content), [node]);
        }
        index += 1;
    }
    return steps;
}

function addUnresolved(
    context: ParseContext,
    path: string,
    kind: WikiTranscriptUnresolvedHook["kind"],
    text: string,
    nodes: readonly BulletNode[],
): void {
    context.unresolved.push({
        path,
        kind,
        text: stripWikiMarkup(text),
        wikitext: nodes.map(serializeBulletNode).join("\n"),
    });
}

function serializeBulletNode(node: BulletNode): string {
    return [node.raw, ...node.children.map(serializeBulletNode)].join("\n");
}

interface ParsedTemplate {
    name: string;
    positional: string[];
    named: Record<string, string>;
}

function parseTemplate(content: string): ParsedTemplate | undefined {
    const trimmed = content.trim();
    if (!trimmed.startsWith("{{") || !trimmed.endsWith("}}")) return undefined;
    const parts = splitTemplateParts(trimmed.slice(2, -2));
    if (parts.length === 0) return undefined;
    const positional: string[] = [];
    const named: Record<string, string> = {};
    for (const part of parts.slice(1)) {
        const equals = part.indexOf("=");
        if (equals > 0) named[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
        else positional.push(part.trim());
    }
    return { name: parts[0].trim().toLowerCase(), positional, named };
}

function splitTemplateParts(value: string): string[] {
    const parts: string[] = [];
    let current = "";
    let templateDepth = 0;
    let linkDepth = 0;
    for (let i = 0; i < value.length; i++) {
        const pair = value.slice(i, i + 2);
        if (pair === "{{") { templateDepth += 1; current += pair; i += 1; continue; }
        if (pair === "}}") { templateDepth -= 1; current += pair; i += 1; continue; }
        if (pair === "[[") { linkDepth += 1; current += pair; i += 1; continue; }
        if (pair === "]]" ) { linkDepth -= 1; current += pair; i += 1; continue; }
        if (value[i] === "|" && templateDepth === 0 && linkDepth === 0) {
            parts.push(current);
            current = "";
        } else current += value[i];
    }
    parts.push(current);
    return parts;
}

function templateLabel(content: string): string {
    const parsed = parseTemplate(content);
    if (!parsed) return "";
    return stripWikiMarkup(parsed.positional[0] ?? "");
}

function describeActionTemplate(template: ParsedTemplate): string {
    const named = Object.entries(template.named).map(([key, value]) => `${key}: ${value}`);
    return stripWikiMarkup([...template.positional, ...named].filter(Boolean).join("; ") || template.name);
}

function parseSpokenLine(content: string): { name: string; isPlayer: boolean; text: string } | undefined {
    const match = content.match(/^'''([^']+):'''\s*(.+)$/);
    if (!match) return undefined;
    const name = stripWikiMarkup(match[1]);
    const text = stripWikiMarkup(match[2]);
    if (!text) return undefined;
    return { name, isPlayer: name.toLowerCase() === "player", text };
}

export function stripWikiMarkup(value: string): string {
    return value
        .replace(/\{\{!\}\}/g, "|")
        .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
        .replace(/\[\[([^\]]+)\]\]/g, "$1")
        .replace(/\{\{(?:sic|nowrap)\|([^{}]*)\}\}/gi, "$1")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, "")
        .replace(/''+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
