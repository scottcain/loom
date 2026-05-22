import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pagesApi from "../extensions/loom/galaxy-pages-api";
import * as galaxyApi from "../extensions/loom/galaxy-api";
import * as notebookWriter from "../extensions/loom/notebook-writer";
import * as state from "../extensions/loom/state";
import { pushNotebookToGalaxy } from "../extensions/loom/galaxy-pages-sync";

vi.mock("../extensions/loom/galaxy-pages-api");
vi.mock("../extensions/loom/galaxy-api");
vi.mock("../extensions/loom/notebook-writer", async (importOriginal) => {
    const actual = await importOriginal<typeof notebookWriter>();
    return {
        ...actual,
        readNotebook: vi.fn(),
        writeNotebook: vi.fn(),
        withNotebookLock: vi.fn(async (_p: string, fn: () => Promise<unknown>) => fn()),
    };
});
vi.mock("../extensions/loom/state");

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(state.getNotebookPath).mockReturnValue("/work/notebook.md");
    vi.mocked(galaxyApi.getGalaxyConfig).mockReturnValue({
        url: "https://galaxy.example",
        apiKey: "k",
    });
    vi.mocked(notebookWriter.withNotebookLock).mockImplementation(
        async (_p: string, fn: () => Promise<unknown>) => fn() as Promise<never>,
    );
});

describe("pushNotebookToGalaxy", () => {
    it("creates a new page when notebook has no binding", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(
            "# Analysis\n\nBody content.\n",
        );
        vi.mocked(pagesApi.createPage).mockResolvedValue({
            id: "p1",
            slug: "analysis",
            latest_revision_id: "r1",
            revision_ids: ["r1"],
            title: "Analysis",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-20T00:00:00Z",
        });

        const result = await pushNotebookToGalaxy({
            historyId: "h1",
            title: "Analysis",
        });

        expect(pagesApi.createPage).toHaveBeenCalledWith({
            history_id: "h1",
            title: "Analysis",
            slug: undefined,
            annotation: undefined,
            content: "# Analysis\n\nBody content.\n",
            content_format: "markdown",
        });
        expect(result).toEqual({
            pageId: "p1",
            pageSlug: "analysis",
            latestRevisionId: "r1",
            action: "created",
        });
        expect(notebookWriter.writeNotebook).toHaveBeenCalledOnce();
        const written = vi.mocked(notebookWriter.writeNotebook).mock
            .calls[0][1];
        expect(written).toContain("```loom-galaxy-page");
        expect(written).toContain("page_id: p1");
        expect(written).toContain("last_synced_revision: r1");
    });

    it("updates the existing page when a binding is present", async () => {
        const initial = [
            "# Analysis",
            "",
            "Body content.",
            "",
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: analysis",
            'galaxy_server_url: "https://galaxy.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(initial);
        vi.mocked(pagesApi.updatePage).mockResolvedValue({
            id: "p1",
            slug: "analysis",
            latest_revision_id: "r2",
            revision_ids: ["r1", "r2"],
            title: "Analysis",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-21T00:00:00Z",
        });

        const result = await pushNotebookToGalaxy();

        expect(pagesApi.updatePage).toHaveBeenCalledWith(
            "p1",
            expect.objectContaining({
                content: expect.not.stringContaining("loom-galaxy-page"),
                content_format: "markdown",
                edit_source: "agent",
            }),
        );
        expect(result).toEqual({
            pageId: "p1",
            pageSlug: "analysis",
            latestRevisionId: "r2",
            action: "updated",
        });
        const written = vi.mocked(notebookWriter.writeNotebook).mock.calls.at(
            -1,
        )![1];
        expect(written).toContain("last_synced_revision: r2");
    });

    it("throws on server-URL mismatch before calling Galaxy", async () => {
        const initial = [
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: a",
            'galaxy_server_url: "https://other.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(initial);

        await expect(pushNotebookToGalaxy()).rejects.toThrow(
            /bound to.*other\.example.*connected to.*galaxy\.example/,
        );
        expect(pagesApi.updatePage).not.toHaveBeenCalled();
    });
});
