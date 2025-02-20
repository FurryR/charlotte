import type { GlobalCtx } from './ctx';
import type { Match } from './match';
import intl, { defineMessage } from '../util/l10n';
import { isMatchingCurrentURL } from './match';
import console, { createConsole } from '../util/console';
import { Graph } from '../util/graph';
import EventEmitter from 'eventemitter3';

export interface Userscript {
    func: (ctx: AddonCtx) => Promise<(() => void) | void>;
    matches: readonly Match[];
    runAtComplete: boolean;
}

export interface Userstyle {
    stylesheet: string;
    matches: readonly Match[];
}

interface DeferredScript {
    belongs: string;
    func: () => Promise<(() => void) | void>;
}

export interface AddonCtx {
    addon: GlobalCtx;
    console: Console;
    intl: typeof intl;
    settings: AddonSettings;
}

export interface AddonSettingBoolean {
    id: string;
    name: string;
    type: 'boolean';
    default: boolean;
}

export interface AddonSettingInt {
    id: string;
    name: string;
    type: 'integer' | 'positive_integer';
    default: number;
    min?: number;
    max?: number;
}

export interface AddonSettingString {
    id: string;
    name: string;
    type: 'string';
    default: string;
}

export interface AddonSettingColor {
    id: string;
    name: string;
    type: 'color';
    default: `#${string}`;
    allowTransparency?: boolean;
}

export interface AddonSelectorItem {
    id: string;
    name: string;
    value: string;
}

export interface AddonSettingSelect {
    id: string;
    name: string;
    type: 'select';
    default: string;
    items: readonly AddonSelectorItem[];
}

export type AddonSetting = AddonSettingBoolean | AddonSettingSelect | AddonSettingColor | AddonSettingString | AddonSettingInt;

export interface AddonManifest {
    id: string;
    name: string;
    description: string;
    required: readonly string[];
    enabledByDefault: boolean;
    dynamicEnable: boolean;
    dynamicDisable: boolean;
    userscripts: readonly Userscript[];
    userstyles: readonly Userstyle[];
    settings: Record<string, AddonSetting>;
}

export interface RuntimeAddon {
    enabled?: boolean;
    disposers?: (() => void)[];
}

const activatedMessage = defineMessage({
    id: '@core/addonActivated',
    defaultMessage: '{name} (id: {id}) activated!'
});

let globalCtx: GlobalCtx | null = null;
export const runtimeAddons: Record<string, RuntimeAddon> = {};
const deferredScripts: DeferredScript[] = [];

export function attachCtx (ctx: GlobalCtx) {
    globalCtx = ctx;
}

class AddonSettings extends EventEmitter {
    id: string;
    constructor (addonId: string) {
        super();
        this.id = addonId;
        globalCtx!.on('core.settings.changed', this.#filter);
    }

    #filter (name: string, value: string) {
        if (name.startsWith(`@${this.id}/`)) {
            this.emit('change', name.slice(`@${this.id}/`.length - 1), value);
        }
    }

    get (name: string) {
        return globalCtx!.settings[`@${this.id}/${name}`]
            ?? globalCtx!.addons[this.id].settings[name].default;
    }

    dispose () {
        globalCtx!.off('core.settings.changed', this.#filter);
    }
}

function wrapAddonSettings (id: string) {
    return new AddonSettings(id);
}

export async function activateByOrder (ids: string[]) {
    const graph = new Graph();
    const requireStack = new Set<string>();
    for (const id of ids) {
        _checkLoadingOrderById(id, [], graph, requireStack);
    }
    const orderedIds = graph.topo();
    for (const id of orderedIds) {
        try {
            console.log(intl.formatMessage({
                id: '@core/activatingAddon',
                defaultMessage: 'Activating {id}...'
            }, {id}));
            // Ensure required addons activated ahead
            if (requireStack.has(id)) {
                await activate(id);
            } else {
                activate(id);
            }
        } catch (e) {
            console.error(intl.formatMessage({
                id: '@core/errorOccuredWhileActivating',
                defaultMessage: 'Loader: Error occured while activating {id}\n'
            }, {id}), e);
        }
    }
}

function _checkLoadingOrderById (id: string, requireStack: string[], graph: Graph, allRequired: Set<string> = new Set()) {
    if (!globalCtx) {
        throw new Error('Loader: globalCtx not attached');
    }

    requireStack.push(id);
    if (!graph.hasNode(id)) {
        graph.addNode(id);
    }
    for (const dependency of globalCtx.addons[id].required) {
        if (!globalCtx.addons[dependency]) {
            throw new Error(`unavailable dependency ${dependency} requested by ${id}`);
        }
        if (_findIdInList(dependency, requireStack) !== -1) {
            throw new Error(`circular requirement ${dependency} requested by ${id}`);
        }
        graph.addEdge(dependency, id);
        allRequired.add(dependency);
        _checkLoadingOrderById(dependency, requireStack, graph, allRequired);
    }
    requireStack.pop();
}

function _findIdInList (id: string, list: string[]) {
    for (const i in list) {
        if (list[i] === id) {
            return i;
        }
    }
    return -1;
}

export async function deactivateByOrder (ids: string[]) {
    const graph = new Graph();
    for (const id of ids) {
        if (runtimeAddons[id]?.enabled) {
            _checkUnloadingOrderById(id, graph);
        }
    }
    const orderedIds =  graph.topo();
    for (const id of orderedIds) {
        try {
            await deactivate(id);
        } catch (e) {
            console.error(intl.formatMessage({
                id: '@core/errorOccuredWhileDeactivating',
                defaultMessage: 'Loader: Error occured while deactivating {id}\n'
            }, {id}), e);
        }
    }
}

function _checkUnloadingOrderById (id: string, graph: Graph, last?: string) {
    if (!graph.hasNode(id)) {
        graph.addNode(id);
    }
    for (const targetId in globalCtx.addons) {
        if (targetId === last) continue;
        if (globalCtx.addons[targetId]) {
            if (globalCtx.addons[targetId].required.includes(id)) {
                graph.addEdge(targetId, id);
                _checkUnloadingOrderById(targetId, graph, id);
            }
        }
    }
}

export async function activate (id: string) {
    if (!globalCtx) {
        throw new Error('Loader: globalCtx not attached');
    }

    const addon = globalCtx.addons[id];
    if (typeof runtimeAddons[id] !== 'object') {
        runtimeAddons[id] = {};
    }
    const runtimeAddon = runtimeAddons[id];

    if (runtimeAddon.enabled) {
        return console.warn(intl.formatMessage({
            id: '@core/cannotActivateEnabledAddon',
            defaultMessage: 'cannot activate an enabled addon: {id}'
        }, {id}));
    }

    // Apply userscripts
    const addonSettings = wrapAddonSettings(id);
    runtimeAddon.disposers = [];
    runtimeAddon.disposers.push(() => {
        addonSettings.dispose();
    });
    let hasDeferredScripts = false;
    for (const script of addon.userscripts) {
        if (!isMatchingCurrentURL(script.matches)) continue;

        const wrappedScript = script.func.bind(
            script, {
                addon: globalCtx,
                console: createConsole(addon.name),
                intl: intl,
                settings: addonSettings
            });
        if (script.runAtComplete && document.readyState !== 'complete') {
            hasDeferredScripts = true;
            deferredScripts.push({
                belongs: id,
                func: wrappedScript
            });
            continue;
        }
        const disposer = await wrappedScript().catch(e => {
            console.error(`(${id}) ${script.func.name.toString()}: `, e);
        });
        if (typeof disposer === 'function') {
            runtimeAddon.disposers.push(disposer);
        }
    }

    // Apply styles
    if (addon.userstyles.length > 0) {
        const styleElement = document.createElement('style');
        styleElement.type = `text/css`;
        styleElement.id = `charlotte-addon-styles-${id}`;
        for (const style of addon.userstyles) {
            if (!isMatchingCurrentURL(style.matches)) continue;
            styleElement.innerHTML += `${style.stylesheet}\n`;
        }
        document.head.append(styleElement);
    }

    if (!hasDeferredScripts) {
        runtimeAddon.enabled = true;
        globalCtx.emit('core.addon.activated', id);
        console.log(intl.formatMessage(activatedMessage, {name: addon.name, id}));
    } else {
        document.addEventListener('readystatechange', loadScriptAtComplete);
        loadScriptAtComplete();
    }
}

export async function deactivate (id: string) {
    if (!globalCtx) {
        throw new Error('Loader: globalCtx not attached');
    }

    const addon = globalCtx.addons[id];
    if (typeof runtimeAddons[id] !== 'object') {
        runtimeAddons[id] = {};
    }
    const runtimeAddon = runtimeAddons[id];
    if (!runtimeAddon.enabled) {
        return console.warn(intl.formatMessage({
            id: '@core/cannotDeactivateDisabledAddon',
            defaultMessage: 'cannot deactivate a disabled addon: {id}'
        }, {id}));
    }

    // Execute disposers
    for (const disposer of runtimeAddon.disposers) {
        await disposer();
    }

    // Remove styles
    if (addon.userstyles.length > 0) {
        const styleElem = document.querySelector(`#charlotte-addon-styles-${id}`);
        if (styleElem) {
            styleElem.remove();
        }
    }

    runtimeAddon.enabled = false;
    globalCtx.emit('core.addon.deactivated', id);
    console.log(intl.formatMessage({
        id: '@core/addonDeactivated',
        defaultMessage: '{name} (id: {id}) deactivated!'
    }, {name: addon.name, id}));
}

async function loadScriptAtComplete () {
    if (document.readyState === 'complete') {
        if (!globalCtx) {
            throw new Error('Loader: globalCtx not attached');
        }

        const activatedAddons = new Set<string>();
        if (deferredScripts.length > 0) {
            for (const script of deferredScripts) {
                const addon = runtimeAddons[script.belongs];
                const disposer = await script.func().catch(e => {
                    console.error(`(${script.belongs}) ${script.func.name.toString()}: `, e);
                });
                if (typeof disposer === 'function') {
                    addon.disposers.push(disposer);
                }
                activatedAddons.add(script.belongs);
            }

            for (const id of activatedAddons) {
                const addon = globalCtx.addons[id];
                const runtimeAddon = runtimeAddons[id];
                runtimeAddon.enabled = true;
                globalCtx.emit('core.addon.activated', id);
                console.log(intl.formatMessage(activatedMessage, {name: addon.name, id}));
            }
        }

        document.removeEventListener('readystatechange', loadScriptAtComplete);
    }
}
