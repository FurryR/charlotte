import type { AddonManifest, RuntimeAddon } from '../loader/loader';
import { createSignal, Switch as SolidSwitch, Match, Show, For, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import intl from '../util/l10n';
import console from '../util/console';
import classNames from 'classnames';
import globalCss from './style.css';
import type { GlobalCtx } from '../loader/ctx';
import styles, { stylesheet } from './style.module.css';
import closeIcon from './assets/icon--close.svg';

let setModalStatus: null | Function = null;

let globalCtx: GlobalCtx | null = null;
export function attachCtx (ctx: GlobalCtx) {
    globalCtx = ctx;
}

interface SwitchProps {
    value?: boolean;
    disabled?: boolean;
    onChange: (value: boolean) => void;
}

interface AddonStatus extends RuntimeAddon {
    pending?: boolean;
}

interface AddonProps {
    addon: AddonManifest,
    status?: AddonStatus;
    onSwitch (value: boolean): void;
}

function AddonCard (props: AddonProps) {
    const [expand, setExpand] = createSignal(false);
    return (
        <div class={classNames(styles.addon, expand() ? styles.expand : null)}>
            <div class={styles.addonHeader}>
                <div class={styles.info} onClick={() => {
                    setExpand(!expand());
                }}>
                    <span class={styles.name}>{props.addon.name}</span>
                    <span class={styles.description}>{props.addon.description}</span>
                </div>
                <Switch value={props.status && props.status.enabled} disabled={props.status && props.status.pending} onChange={props.onSwitch} />
            </div>
            <Show when={expand()}>
                <div class={styles.settings}>
                    <For each={Object.values(props.addon.settings)}>
                        {(setting) => (
                            <div class={styles.settingItem}>
                                <span class={styles.subname}>{setting.name}</span>
                                <SolidSwitch>
                                    <Match when={setting.type === 'boolean'}>
                                        <Switch
                                            value={globalCtx.settings[`@${props.addon.id}/${setting.id}`] ?? setting.default}
                                            disabled={!props.status?.enabled}
                                            onChange={(value: boolean) => {
                                                globalCtx.settings[`@${props.addon.id}/${setting.id}`] = value;
                                            }}
                                        />
                                    </Match>
                                </SolidSwitch>
                            </div>
                        )}
                    </For>
                </div>
            </Show>
        </div>
    );
}

function Switch (props: SwitchProps) {
    const [value, setValue] = createSignal(props.value ?? false);

    const handleClick = () => {
        if (!props.disabled) {
            props.onChange(!value());
            setValue(!value());
        }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' && !props.disabled) {
            setValue(!value());
            props.onChange(!value());
            event.stopPropagation();
        }
    };

    return (
        <div
            class={classNames(styles.switch, value() ? styles.true : styles.false, props.disabled ? styles.disabled : null)}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
        >
            <div class={classNames(styles.slider, value() ? styles.true : styles.false, props.disabled ? styles.disabled : null)} />
            <input class={styles.dummyInput} inputMode='none' />
        </div>
    );
}

function Modal () {
    const [show, setShow] = createSignal(true);
    const [refreshRequested, setRefreshRequested] = createSignal(false);
    const [addons, setAddons] = createSignal<Record<string, AddonManifest>>(Object.assign({}, globalCtx.addons));
    const [runtimeAddons, setRuntimeAddons] = createSignal<Record<string, AddonStatus>>(Object.assign({}, globalCtx.loader.runtimeAddons));
    const activate = (id: string) => {
        const newAddonStatus = Object.assign({}, runtimeAddons()[id], {enabled: true, pending: addons()[id].dynamicEnable});
        setRuntimeAddons(Object.assign({}, runtimeAddons(), {[id]: newAddonStatus}));
        if (addons()[id].dynamicEnable) globalCtx!.loader.activate(id);
        else setRefreshRequested(true);
    };
    const deactivate = (id: string) => {
        const newAddonStatus = Object.assign({}, runtimeAddons()[id], {enabled: false, pending: addons()[id].dynamicDisable});
        setRuntimeAddons(Object.assign({}, runtimeAddons(), {[id]: newAddonStatus}));
        if (addons()[id].dynamicDisable) globalCtx!.loader.deactivate(id);
        else setRefreshRequested(true);
    };
    onMount(() => {
        setModalStatus = setShow;
        // Track addon status
        globalCtx.on('core.addon.activated', (id: string) => {
            const newAddonStatus = Object.assign({}, runtimeAddons()[id], {enabled: true, pending: false});
            setRuntimeAddons(Object.assign({}, runtimeAddons(), {[id]: newAddonStatus}));
        });
        globalCtx.on('core.addon.deactivated', (id: string) => {
            const newAddonStatus = Object.assign({}, runtimeAddons()[id], {enabled: false, pending: false});
            setRuntimeAddons(Object.assign({}, runtimeAddons(), {[id]: newAddonStatus}));
        });
        globalCtx.on('core.addonList.reloaded', () => {
            setAddons(Object.assign({}, globalCtx.addons));
        });
    });

    return (
        <Show when={show()}>
            <div
                id='charlotte-overlay'
                class={styles.overlay}
                onClick={() => setShow(false)}
            />
            <div class={styles.container}>
                <div class={styles.modal}>
                    <div class={styles.header}>
                        <span class={styles.title}>{intl.formatMessage({
                            id: '@core/modalTitle',
                            defaultMessage: 'Addons'
                        })}</span>
                        <div class={styles.headerItem}>
                            <div
                                aria-label={intl.formatMessage({
                                    id: '@core/modalCloseAria',
                                    defaultMessage: 'Close'
                                })}
                                class={styles.closeButton}
                                role='button'
                                tabIndex='0'
                                onClick={() => setShow(false)}
                            >
                                <img
                                    class={styles.closeIcon}
                                    src={closeIcon}
                                />
                            </div>
                        </div>
                    </div>
                    <div class={styles.body}>
                        <Show when={refreshRequested()}>
                            <span class={styles.alert}>
                                {intl.formatMessage({
                                    id: '@core/modalRefreshRequested',
                                    defaultMessage: 'Some changes require a refresh to take effect.'
                                })}
                            </span>
                        </Show>
                        <For each={Object.values(addons())}>
                            {(addon) => (
                                <AddonCard addon={addon} status={runtimeAddons()[addon.id]} onSwitch={(value: boolean) => {
                                    if (value) {
                                        activate(addon.id);
                                    } else {
                                        deactivate(addon.id);
                                    }
                                    globalCtx.settings[`@${addon.id}/enabled`] = value;
                                }} />
                            )}
                        </For>
                    </div>
                </div>
            </div>
        </Show>
    );
}

export function openFrontend () {
    if (!setModalStatus) {
        // Initialize front-end
        const style = document.createElement('style');
        style.id = 'charlotte-styles';
        style.innerHTML = `${globalCss}\n${stylesheet}`;
        document.head.append(style);
        render(Modal, document.body);
    } else {
        setModalStatus(true);
    }
}
