export default async function ({ addon, intl }) {
    const Blockly = await addon.api.getBlockly();

    function makeStyle () {
        const style = document.createElement('style');
        style.textContent = `
    .blocklyText {
        fill: ${Blockly.Colours.text};
        font-family: "Helvetica Neue", Helvetica, sans-serif;
        font-size: 12pt;
        font-weight: 500;
    }
    .blocklyNonEditableText>text, .blocklyEditableText>text {
        fill: ${Blockly.Colours.textFieldText};
    }
    .blocklyDropdownText {
        fill: ${Blockly.Colours.text} !important;
    }
    `;
        return style;
    }

    function setCSSVars (element) {
        for (const property of document.documentElement.style) {
            if (property.startsWith('--editorTheme3-'))
                element.style.setProperty(property, document.documentElement.style.getPropertyValue(property));
        }
    }

    const exSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    exSVG.setAttribute('xmlns:html', 'http://www.w3.org/1999/xhtml');
    exSVG.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    exSVG.setAttribute('version', '1.1');

    const enabledAddons = Object.keys(addon.loader.runtimeAddons);

    addon.api.createBlockContextMenu(
        (items) => {
            const svgchild = document.querySelector('svg.blocklySvg g.blocklyBlockCanvas');

            const pasteItemIndex = items.findIndex((obj) => obj._isDevtoolsFirstItem);
            const insertBeforeIndex =
        pasteItemIndex !== -1
            ? // If "paste" button exists, add own items before it
            pasteItemIndex
            : // If there's no such button, insert at end
            items.length;

            items.splice(
                insertBeforeIndex,
                0,
                {
                    enabled: !!svgchild?.childNodes?.length,
                    text: intl.formatMessage({id: '@blocks2image/export_all_to_SVG', defaultMessage: 'Export all as SVG'}),
                    callback: () => {
                        exportBlock(false);
                    },
                    separator: true,
                },
                {
                    enabled: !!svgchild?.childNodes?.length,
                    text: intl.formatMessage({id: '@blocks2image/export_all_to_PNG', defaultMessage: 'Export all as PNG'}),
                    callback: () => {
                        exportBlock(true);
                    },
                    separator: false,
                }
            );

            return items;
        },
        { workspace: true }
    );
    addon.api.createBlockContextMenu(
        (items, block) => {
            const makeSpaceItemIndex = items.findIndex((obj) => obj._isDevtoolsFirstItem);
            const insertBeforeIndex =
        makeSpaceItemIndex !== -1
            ? // If "make space" button exists, add own items before it
            makeSpaceItemIndex
            : // If there's no such button, insert at end
            items.length;

            items.splice(
                insertBeforeIndex,
                0,
                {
                    enabled: true,
                    text: intl.formatMessage({id: '@blocks2image/export_selected_to_SVG', defaultMessage: 'Export block as SVG'}),
                    callback: () => {
                        exportBlock(false, block);
                    },
                    separator: true,
                },
                {
                    enabled: true,
                    text: intl.formatMessage({id: '@blocks2image/export_selected_to_PNG', defaultMessage: 'Export block as PNG'}),
                    callback: () => {
                        exportBlock(true, block);
                    },
                    separator: false,
                }
            );

            return items;
        },
        { blocks: true }
    );

    async function exportBlock (isExportPNG, block?: ScratchBlocks.Block) {
        let svg;
        if (block) {
            svg = selectedBlocks(isExportPNG, block);
        } else {
            svg = allBlocks(isExportPNG);
        }
        // Resolve nbsp whitespace
        svg.querySelectorAll('text').forEach((text) => {
            text.innerHTML = text.innerHTML.replace(/&nbsp;/g, ' ');
        });

        // Replace external images with data URIs
        await Promise.all(
            Array.from(svg.querySelectorAll('image')).map(async (item: SVGElement) => {
                const iconUrl = item.getAttribute('xlink:href');
                if (iconUrl.startsWith('data:')) return;
                const blob = await (await fetch(iconUrl)).blob();
                const reader = new FileReader();
                const dataUri = await new Promise((resolve) => {
                    reader.addEventListener('load', () => resolve(reader.result));
                    reader.readAsDataURL(blob);
                });
                item.setAttribute('xlink:href', dataUri as string);
            })
        );
        if (!isExportPNG) {
            exportData(new XMLSerializer().serializeToString(svg));
        } else {
            exportPNG(svg);
        }
    }

    function selectedBlocks (isExportPNG, block) {
        const svg = exSVG.cloneNode() as SVGElement;

        let svgchild = block.svgGroup_;
        svgchild = svgchild.cloneNode(true);
        const dataShapes = svgchild.getAttribute('data-shapes');
        let translateY = 0; // Blocks no hat
        const scale = isExportPNG ? 2 : 1;
        if (dataShapes === 'c-block c-1 hat') {
            translateY = 20; // For My block
        }
        if (dataShapes === 'hat') {
            translateY = 16; // For Events
            if (enabledAddons.includes('cat-blocks')) {
                translateY += 16; // For cat ears
            }
        }
        svgchild.setAttribute('transform', `translate(0,${scale * translateY}) scale(${scale})`);
        setCSSVars(svg);
        svg.append(makeStyle());
        svg.append(svgchild);
        return svg;
    }

    function allBlocks (isExportPNG) {
        const svg = exSVG.cloneNode() as SVGElement;

        let svgchild = document.querySelector('svg.blocklySvg g.blocklyBlockCanvas');
        svgchild = svgchild.cloneNode(true) as SVGElement;

        const xArr = [];
        const yArr = [];

        svgchild.childNodes.forEach((g: SVGElement) => {
            const x = Number(g.getAttribute('transform').match(/translate\((.*?),(.*?)\)/)[1]) || 0;
            const y = Number(g.getAttribute('transform').match(/translate\((.*?),(.*?)\)/)[2]) || 0;
            xArr.push(x * (isExportPNG ? 2 : 1));
            yArr.push(y * (isExportPNG ? 2 : 1));
        });

        svgchild.setAttribute(
            'transform',
            `translate(${-Math.min(...xArr)},${-Math.min(...yArr) + 18 * (isExportPNG ? 2 : 1)}) ${
                isExportPNG ? 'scale(2)' : ''
            }`
        );
        setCSSVars(svg);
        svg.append(makeStyle());
        svg.append(svgchild);
        return svg;
    }

    function exportData (text) {
        const saveLink = document.createElement('a');
        document.body.appendChild(saveLink);

        const data = new Blob([text], { type: 'text' });
        const url = window.URL.createObjectURL(data);
        saveLink.href = url;

        // File name: project-DATE-TIME
        const date = new Date();
        const timestamp = `${date.toLocaleDateString()}-${date.toLocaleTimeString()}`;
        saveLink.download = `block_${timestamp}.svg`;
        saveLink.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(saveLink);
    }

    function exportPNG (svg) {
        const serializer = new XMLSerializer();

        const iframe = document.createElement('iframe');
        // Iframe.style.display = "none"
        document.body.append(iframe);
        iframe.contentDocument.write(serializer.serializeToString(svg));
        const { width, height } = iframe.contentDocument.body.querySelector('svg g').getBoundingClientRect();
        svg.setAttribute('width', width + 'px');
        svg.setAttribute('height', height + 'px');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const img = document.createElement('img');

        img.setAttribute(
            'src',
            'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(serializer.serializeToString(svg))))
        );
        img.onload = function () {
            canvas.height = img.height;
            canvas.width = img.width;
            ctx.drawImage(img, 0, 0, img.width, img.height);
            // Now is done
            const dataURL = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            const date = new Date();
            const timestamp = `${date.toLocaleDateString()}-${date.toLocaleTimeString()}`;

            link.download = `block_${timestamp}.png`;
            link.href = dataURL;
            link.click();
            iframe.remove();
        };
    }
}
