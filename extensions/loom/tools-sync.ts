/**
 * Tool registrations for Loom <-> Galaxy Pages sync.
 *
 * Thin wrappers around the helpers in galaxy-pages-sync.ts. The helpers do
 * all the work (locking, network, binding-block math); these registrations
 * just translate TypeBox-validated params, call the helper, and format the
 * response for the agent.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
    pushNotebookToGalaxy,
    pullNotebookFromGalaxy,
    linkGalaxyPage,
} from "./galaxy-pages-sync";

function errorContent(e: unknown) {
    return {
        content: [
            {
                type: "text" as const,
                text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            },
        ],
        details: { error: true },
    };
}

export function registerNotebookSyncTools(pi: ExtensionAPI): void {
    pi.registerTool({
        name: "notebook_push_to_galaxy",
        label: "Push notebook to Galaxy page",
        description: `Push the local notebook.md to a Galaxy page. If the notebook already
has a loom-galaxy-page binding block, updates that page in place (creates a
new revision). If there's no binding yet, pass history_id (and optionally title,
slug, annotation) to create a new page attached to that history and bind it.
Strips loom-galaxy-page blocks from the body sent to Galaxy, but keeps
loom-invocation blocks (they're analysis content). Unconditional local-wins:
any concurrent Galaxy-UI edits since the last sync are overwritten.`,
        parameters: Type.Object({
            history_id: Type.Optional(
                Type.String({
                    description:
                        "History ID to attach the page to (required when creating a new page).",
                }),
            ),
            title: Type.Optional(
                Type.String({
                    description:
                        "Page title for create. Defaults to 'Untitled notebook' if omitted.",
                }),
            ),
            slug: Type.Optional(
                Type.String({
                    description:
                        "URL slug for create. Lowercase letters, digits, and hyphens. Auto-generated if omitted.",
                }),
            ),
            annotation: Type.Optional(
                Type.String({
                    description: "Optional annotation attached to the page.",
                }),
            ),
        }),
        async execute(_callId, params, _signal, _onUpdate, _ctx) {
            try {
                const result = await pushNotebookToGalaxy({
                    historyId: params.history_id,
                    title: params.title,
                    slug: params.slug,
                    annotation: params.annotation,
                });
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: JSON.stringify(
                                {
                                    page_id: result.pageId,
                                    page_slug: result.pageSlug,
                                    latest_revision_id: result.latestRevisionId,
                                    action: result.action,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                    details: { pageId: result.pageId, action: result.action },
                };
            } catch (e) {
                return errorContent(e);
            }
        },
    });
}
