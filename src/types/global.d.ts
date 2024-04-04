/// <reference path="../core/loader/ctx" />
/// <reference path="../../node_modules/@turbowarp/types/types/scratch-vm.d.ts" />
/// <reference path="./scratch-blocks.d.ts" />

declare interface Window {
    __charlotte?: GlobalCtx;
    __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: Function;
    __scratchAddonsRedux?: object;
    Blockly?: Blockly;
}
