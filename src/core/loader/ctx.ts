import EventEmitter from 'eventemitter3';
import type { AddonManifest } from './loader';
import type { Settings } from '../util/settings';
import addons from '../../addons';
import * as loader from '../loader/loader';
import * as app from '../ui/app';
import { attachCtx, settings } from '../util/settings';

class Ctx extends EventEmitter {
    version: string;
    addons: Record<string, AddonManifest> = addons();
    settings = settings;
    loader = loader;
    app = app;

    constructor (version: string) {
        super();
        this.version = version;
        attachCtx(this);
    }

    reloadAddonList () {
        this.addons = addons();
        this.emit('core.addonList.reloaded');
    }
    getLocale () {
        return settings.locale ?? 'en';
    }
}

export type GlobalCtx = Ctx;

export function createCtx (version: string) {
    return new Ctx(version);
}
