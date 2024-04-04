export default async function ({ addon, settings }) {
    const ScratchBlocks = await addon.api.getBlockly();
    const vm = await addon.api.getVM();

    const opcodeToSettings = {
        text: 'text',
        argument_editor_string_number: 'text',
        math_number: 'number',
        math_integer: 'number',
        math_whole_number: 'number',
        math_positive_number: 'number',
        math_angle: 'number',
        note: 'number',
        colour_picker: 'color',
    };

    const originalJsonInit = ScratchBlocks.BlockSvg.prototype.jsonInit;

    ScratchBlocks.BlockSvg.prototype.jsonInit = function (json) {
        if (opcodeToSettings[this.type] && settings.get(opcodeToSettings[this.type])) {
            originalJsonInit.call(this, {
                ...json,
                outputShape: ScratchBlocks.OUTPUT_SHAPE_SQUARE,
            });
        } else {
            originalJsonInit.call(this, json);
        }
    };

    function update () {
        updateAllBlocks(vm, window.Blockly.getWorkspace(), ScratchBlocks);
    }
  
    function updateAllBlocks (vm, workspace, blockly) {
        const eventsOriginallyEnabled = blockly.Events.isEnabled();
        blockly.Events.disable(); // Clears workspace right-click→undo (see SA/SA#6691)

        if (workspace) {
            if (vm.editingTarget) {
                vm.emitWorkspaceUpdate();
            }
            const flyout = workspace.getFlyout();
            if (flyout) {
                const flyoutWorkspace = flyout.getWorkspace();
                window.Blockly.Xml.clearWorkspaceAndLoadFromXml(
                    window.Blockly.Xml.workspaceToDom(flyoutWorkspace),
                    flyoutWorkspace
                );
                workspace.getToolbox().refreshSelection();
                workspace.toolboxRefreshEnabled_ = true;
            }
        }

        // There's no particular reason for checking whether events were originally enabled.
        // Unconditionally enabling events at this point could, in theory, cause bugs in the future.
        if (eventsOriginallyEnabled) blockly.Events.enable(); // Re-enable events
    }

    return () => {
        ScratchBlocks.BlockSvg.prototype.jsonInit = originalJsonInit;
        update();
    };
    settings.on('change', (_?: string, __?: string) => update());
    update();
}
