import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    scriptsDir: string;
    hidePatterns: string[];
    showPatterns: string[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    scriptsDir: '_Meta/Scripts',
    hidePatterns: [],
    showPatterns: []
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Apply file visibility rules
        this.applyFileVisibilityRules();

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
            // Called when the user clicks the icon.
            new Notice('This is a notice!');
        });
        // Perform additional things with the ribbon
        ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('');

        // Exec: run executables from scripts directory
        this.addCommand({
            id: 'task-run-vault',
            name: 'Task run',
            callback: async () => {
                const tasks = this.listExecutableFiles();
                if (!tasks.length) { new Notice('No executables found in scripts directory'); return; }
                new ExecModal(this.app, tasks, async (value: { task: string; args: string }) => {
                    const basePath = this.getVaultBasePath();
                    const scriptsDir = (this.settings.scriptsDir || '').replace(/^[\\/]+|[\\/]+$/g, '');
                    const selected = value.task;
                    const abs = path.isAbsolute(selected) ? selected : path.join(basePath, scriptsDir, selected);
                    const execCwd = path.dirname(abs);
                    const raw = value.args || '';

                    const out = new ExecOutputModal(this.app, `Exec: ${selected}`);
                    out.open();

                    await new Promise<void>((resolve) => {
                        const child = spawn(abs, raw ? [raw] : [], { cwd: execCwd, stdio: ['ignore', 'pipe', 'pipe'] });
                        let sawOutput = false;
                        let startTime = Date.now();
                        
                        // Add initial status message
                        out.append(`Starting: ${selected}${raw ? ` with args: ${raw}` : ''}\n`);
                        out.append(`Working directory: ${execCwd}\n`);
                        out.append(`Started at: ${new Date().toLocaleTimeString()}\n`);
                        out.append('─'.repeat(50) + '\n');
                        
                        child.stdout.on('data', (d) => { 
                            sawOutput = true; 
                            try { 
                                out.append(String(d)); 
                            } catch (e) {
                                console.error('Error appending stdout:', e);
                            }
                        });
                        
                        child.stderr.on('data', (d) => { 
                            sawOutput = true; 
                            try { 
                                out.append(String(d)); 
                            } catch (e) {
                                console.error('Error appending stderr:', e);
                            }
                        });
                        
                        child.on('close', (code) => {
                            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                            out.append('\n' + '─'.repeat(50) + '\n');
                            out.append(`Process completed in ${duration}s with exit code: ${code}\n`);
                            
                            const success = code === 0;
                            out.setCompleted(success, code || undefined);
                            
                            if (!sawOutput) {
                                out.append('No output\n');
                                new Notice('Exec finished with no output');
                            } else if (!success) {
                                new Notice(`Exec failed (${selected}) code ${code}`);
                            } else {
                                new Notice(`Exec completed: ${selected}`);
                            }
                            resolve();
                        });
                        
                        child.on('error', (err) => {
                            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                            out.append('\n' + '─'.repeat(50) + '\n');
                            out.append(`Process failed after ${duration}s\n`);
                            out.append("\n[error] " + (err?.message || String(err)) + "\n");
                            
                            out.setCompleted(false);
                            new Notice(`Exec error: ${err?.message || String(err)}`);
                            resolve();
                        });
                    });
                }).open();
            }
        });

        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        });

        this.addCommand({
            id: 'toggle-hide-files',
            name: 'Toggle Hide: Enable/disable hiding files',
            callback: async () => {
                const hasHidePatterns = this.settings.hidePatterns.length > 0;
                if (hasHidePatterns) {
                    (this.settings as any)._hiddenHidePatterns = [...this.settings.hidePatterns];
                    this.settings.hidePatterns = [];
                    new Notice('File hiding disabled');
                } else {
                    const stored = (this.settings as any)._hiddenHidePatterns;
                    if (stored && Array.isArray(stored)) {
                        this.settings.hidePatterns = [...stored];
                        new Notice('File hiding enabled');
                    } else {
                        new Notice('No hide patterns configured');
                    }
                }
                await this.saveSettings();
                this.applyFileVisibilityRules();
            }
        });

        this.addCommand({
            id: 'toggle-show-files',
            name: 'Toggle Show: Enable/disable showing hidden files',
            callback: async () => {
                const hasShowPatterns = this.settings.showPatterns.length > 0;
                if (hasShowPatterns) {
                    (this.settings as any)._hiddenShowPatterns = [...this.settings.showPatterns];
                    this.settings.showPatterns = [];
                    new Notice('Show patterns disabled');
                } else {
                    const stored = (this.settings as any)._hiddenShowPatterns;
                    if (stored && Array.isArray(stored)) {
                        this.settings.showPatterns = [...stored];
                        new Notice('Show patterns enabled');
                    } else {
                        new Notice('No show patterns configured');
                    }
                }
                await this.saveSettings();
                this.applyFileVisibilityRules();
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    private getVaultBasePath(): string {
        const adapter: any = this.app.vault.adapter as any;
        const base = typeof adapter?.getBasePath === 'function' ? adapter.getBasePath() : adapter?.basePath;
        if (!base) throw new Error('vault base path not available');
        return base as string;
    }

    private listExecutableFiles(): string[] {
        try {
            const basePath = this.getVaultBasePath();
            let scriptsDir = this.settings.scriptsDir;
            if (!scriptsDir) return [];
            scriptsDir = scriptsDir.replace(/^[\\/]+|[\\/]+$/g, '');
            const dirPath = path.join(basePath, scriptsDir);
            const entries = fs.readdirSync(dirPath, { withFileTypes: true } as any);
            const out: string[] = [];
            for (const e of entries as any[]) {
                if (!e.isFile()) continue;
                const name: string = e.name;
                const full = path.join(dirPath, name);
                try {
                    const st = fs.statSync(full);
                    const isExec = (st.mode & 0o111) !== 0;
                    let hasShebang = false;
                    if (!isExec) {
                        try {
                            const buf = fs.readFileSync(full, { encoding: 'utf8', flag: 'r' }).slice(0, 128);
                            hasShebang = buf.startsWith('#!');
                        } catch {}
                    }
                    if (isExec || hasShebang) out.push(name);
                } catch {}
            }
            return out.sort();
        } catch { return []; }
    }

    applyFileVisibilityRules(): void {
        const { vault } = this.app;
        const adapter: any = vault.adapter;

        // Patch adapter to show/hide files
        this.patchAdapter();

        // Also patch file explorer if available
        this.patchFileExplorer();
    }

    private patchAdapter(): void {
        const { vault } = this.app;
        const adapter: any = vault.adapter;
        const hiddenPaths = new Set<string>();

        // Patch reconcileDeletion to intercept hidden files
        if (adapter && adapter.reconcileDeletion) {
            const originalReconcileDeletion = adapter.reconcileDeletion.bind(adapter);
            adapter.reconcileDeletion = async (realPath: string, path: string) => {
                const isHidden = this.isHiddenPath(path);

                if (isHidden) {
                    // Check if file exists
                    const exists = adapter._exists ?
                        await adapter._exists(adapter.getFullPath(path), path) :
                        await adapter.exists(path);

                    if (exists) {
                        hiddenPaths.add(path);
                        if (this.shouldShowHiddenFile(path)) {
                            return this.showFile(path);
                        }
                    } else {
                        hiddenPaths.delete(path);
                    }
                }
                return originalReconcileDeletion(realPath, path);
            };
        }

        // Trigger initial scan after layout is ready
        this.app.workspace.onLayoutReady(async () => {
            if (adapter.listRecursive) {
                try {
                    await adapter.listRecursive("");
                } catch (e) {
                    console.error("Failed to trigger file scan:", e);
                }
            }
        });
    }

    private shouldShowHiddenFile(path: string): boolean {
        for (const pattern of this.settings.showPatterns) {
            if (this.matchesPattern(path, pattern)) return true;
        }
        return false;
    }

    private async showFile(path: string): Promise<void> {
        const adapter: any = this.app.vault.adapter;
        const realPath = adapter.getRealPath(path);

        try {
            if (adapter.reconcileFileInternal) {
                await adapter.reconcileFileInternal(realPath, path);
            } else if (adapter.fs && adapter.fs.stat && adapter.reconcileFileChanged) {
                const stat = await adapter.fs.stat(adapter.getFullRealPath(realPath));
                if (!stat) return;

                if (stat.type === 'file') {
                    adapter.reconcileFileChanged(realPath, path, stat);
                } else if (stat.type === 'directory') {
                    await adapter.reconcileFolderCreation(realPath, path);
                }
            }
        } catch (e) {
            console.error("Failed to show file:", path, e);
        }
    }

    private async hideFile(path: string): Promise<void> {
        const adapter: any = this.app.vault.adapter;
        const realPath = adapter.getRealPath(path);

        try {
            await adapter.reconcileDeletion(realPath, path);
        } catch (e) {
            console.error("Failed to hide file:", path, e);
        }
    }

    private isHiddenPath(path: string): boolean {
        return path.split("/").some(part => part.startsWith("."));
    }

    private filterFileList(fileList: any): any {
        if (!fileList || typeof fileList !== 'object') return fileList;

        const filter = (path: string): boolean => {
            // Check unhide patterns first (higher priority)
            for (const pattern of this.settings.showPatterns) {
                if (this.matchesPattern(path, pattern)) return true;
            }
            // Then check hide patterns
            for (const pattern of this.settings.hidePatterns) {
                if (this.matchesPattern(path, pattern)) return false;
            }
            return true;
        };

        if (fileList.files && Array.isArray(fileList.files)) {
            fileList.files = fileList.files.filter(filter);
        }
        if (fileList.folders && Array.isArray(fileList.folders)) {
            fileList.folders = fileList.folders.filter(filter);
        }

        return fileList;
    }

    private matchesPattern(path: string, pattern: string): boolean {
        // Support both simple wildcards and regex patterns
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            // Treat as regex
            try {
                const regex = new RegExp(pattern.slice(1, -1));
                return regex.test(path);
            } catch {
                return false;
            }
        } else {
            // Treat as simple wildcard pattern
            const regexPattern = pattern
                .replace(/[.+^${}()|[\]\\]/g, '\\$&')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(path);
        }
    }

    private patchFileExplorer(): void {
        const { workspace } = this.app;

        workspace.onLayoutReady(() => {
            const fileExplorers = workspace.getLeavesOfType('file-explorer');
            fileExplorers.forEach(leaf => {
                const view: any = leaf.view;
                if (view && view.fileItems) {
                    // Hide/unhide files in the file explorer
                    this.updateFileExplorerVisibility(view);
                }
            });
        });

        // Re-apply when settings change
        this.registerEvent(
            workspace.on('layout-change' as any, () => {
                const fileExplorers = workspace.getLeavesOfType('file-explorer');
                fileExplorers.forEach(leaf => {
                    const view: any = leaf.view;
                    if (view && view.fileItems) {
                        this.updateFileExplorerVisibility(view);
                    }
                });
            })
        );
    }

    private updateFileExplorerVisibility(view: any): void {
        if (!view.fileItems) return;

        for (const [path, item] of Object.entries(view.fileItems)) {
            const shouldShow = this.shouldShowFile(path);
            const el: HTMLElement = (item as any).el;
            if (el) {
                el.style.display = shouldShow ? '' : 'none';
            }
        }
    }

    private shouldShowFile(path: string): boolean {
        // Check unhide patterns first (higher priority)
        for (const pattern of this.settings.showPatterns) {
            if (this.matchesPattern(path, pattern)) return true;
        }
        // Then check hide patterns
        for (const pattern of this.settings.hidePatterns) {
            if (this.matchesPattern(path, pattern)) return false;
        }
        return true;
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const {contentEl} = this;
        contentEl.setText('Woah2!');
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class ExecModal extends Modal {
    private onSubmit: (value: { task: string; args: string }) => void | Promise<void>;
    private tasks: string[];

    constructor(app: App, tasks: string[] | undefined, onSubmit: (value: { task: string; args: string }) => void | Promise<void>) {
        super(app);
        this.onSubmit = onSubmit;
        this.tasks = Array.isArray(tasks) ? tasks : [];
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Exec' });

        const row = contentEl.createEl('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';

        const select = row.createEl('select');
        select.title = 'Executable';
        select.setAttr('aria-label', 'Executable');
        select.style.minWidth = '200px';
        this.tasks.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.text = name;
            select.appendChild(opt);
        });

        const argsInput = row.createEl('input', { type: 'text' });
        argsInput.placeholder = 'argument (optional, passed as a single string)';
        argsInput.addClass('exec-task-args');
        argsInput.style.flex = '1 1 auto';

        const submit = row.createEl('button', { text: 'Exec' });
        const runSelected = async () => {
            const task = select.value?.trim();
            const args = argsInput.value?.trim() || '';
            this.close();
            await this.onSubmit({ task, args });
        };
        submit.addEventListener('click', runSelected);
        argsInput.addEventListener('keydown', async (e: KeyboardEvent) => { if (e.key === 'Enter') await runSelected(); });
        select.addEventListener('keydown', async (e: KeyboardEvent) => { if (e.key === 'Enter') await runSelected(); });

        setTimeout(() => select.focus(), 0);
    }
}

class ExecOutputModal extends Modal {
    private titleText: string;
    private outputContainer: HTMLElement;
    private outputPre: HTMLElement;
    private progressEl: HTMLElement;
    private isRunning: boolean = true;

    constructor(app: App, titleText: string) { 
        super(app); 
        this.titleText = titleText; 
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        // Create header with title and progress indicator
        const header = contentEl.createEl('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';
        
        const title = header.createEl('h3', { text: this.titleText });
        title.style.margin = '0';
        
        // Progress indicator
        this.progressEl = header.createEl('div');
        this.progressEl.style.display = 'flex';
        this.progressEl.style.alignItems = 'center';
        this.progressEl.style.gap = '8px';
        this.progressEl.style.fontSize = '12px';
        this.progressEl.style.color = 'var(--text-muted)';
        
        const spinner = this.progressEl.createEl('div');
        spinner.style.width = '12px';
        spinner.style.height = '12px';
        spinner.style.border = '2px solid var(--text-muted)';
        spinner.style.borderTop = '2px solid var(--interactive-accent)';
        spinner.style.borderRadius = '50%';
        spinner.style.animation = 'spin 1s linear infinite';
        ;(this as any)._spinner = spinner;
        
        const status = this.progressEl.createEl('span', { text: 'Running...' });
        ;(this as any)._status = status;
        
        // Add CSS for spinner animation
        if (!document.getElementById('obsidian-tools-spinner-css')) {
            const style = document.createElement('style');
            style.id = 'obsidian-tools-spinner-css';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Create scrollable output container
        this.outputContainer = contentEl.createEl('div');
        this.outputContainer.style.maxHeight = '400px';
        this.outputContainer.style.overflowY = 'auto';
        this.outputContainer.style.border = '1px solid var(--background-modifier-border)';
        this.outputContainer.style.borderRadius = '4px';
        this.outputContainer.style.padding = '8px';
        this.outputContainer.style.backgroundColor = 'var(--background-secondary)';
        
        this.outputPre = this.outputContainer.createEl('pre');
        this.outputPre.style.whiteSpace = 'pre-wrap';
        this.outputPre.style.margin = '0';
        this.outputPre.style.fontFamily = 'var(--font-monospace)';
        this.outputPre.style.fontSize = '12px';
        this.outputPre.style.lineHeight = '1.4';
    }

    append(text: string) {
        if (this.outputPre) {
            this.outputPre.textContent = (this.outputPre.textContent || '') + text;
            // Auto-scroll to bottom
            this.outputContainer.scrollTop = this.outputContainer.scrollHeight;
        }
    }

    setCompleted(success: boolean, exitCode?: number) {
        this.isRunning = false;
        const spinner: HTMLElement = (this as any)._spinner;
        const status: HTMLElement = (this as any)._status;
        
        if (spinner) {
            spinner.style.animation = 'none';
            spinner.style.border = '2px solid ' + (success ? 'var(--text-success)' : 'var(--text-error)');
            spinner.style.backgroundColor = success ? 'var(--text-success)' : 'var(--text-error)';
        }
        
        if (status) {
            if (success) {
                status.textContent = 'Completed';
            } else {
                status.textContent = `Failed (exit code: ${exitCode || 'unknown'})`;
            }
        }
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;
    constructor(app: App, plugin: MyPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Scripts directory')
            .setDesc('Relative to vault root, e.g., _Meta/Scripts')
            .addText(text => text
                .setPlaceholder('_Meta/Scripts')
                .setValue(this.plugin.settings.scriptsDir)
                .onChange(async (value) => {
                    this.plugin.settings.scriptsDir = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'File Visibility' });

        new Setting(containerEl)
            .setName('Show patterns')
            .setDesc('Files/folders matching these patterns will be shown even if normally hidden (e.g. dotfiles). One pattern per line. Supports wildcards (* and ?) or regex (/pattern/).')
            .addTextArea(text => text
                .setPlaceholder('One pattern per line')
                .setValue(this.plugin.settings.showPatterns.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.showPatterns = value
                        .split('\n')
                        .map(p => p.trim())
                        .filter(p => p.length > 0);
                    await this.plugin.saveSettings();
                    this.plugin.applyFileVisibilityRules();
                }));

        new Setting(containerEl)
            .setName('Hide patterns')
            .setDesc('Files/folders matching these patterns will be hidden from search and sidebar. One pattern per line. Supports wildcards (* and ?) or regex (/pattern/).')
            .addTextArea(text => text
                .setPlaceholder('One pattern per line')
                .setValue(this.plugin.settings.hidePatterns.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.hidePatterns = value
                        .split('\n')
                        .map(p => p.trim())
                        .filter(p => p.length > 0);
                    await this.plugin.saveSettings();
                    this.plugin.applyFileVisibilityRules();
                }));
    }
}