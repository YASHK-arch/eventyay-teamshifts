const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const pluginRoot = path.resolve(__dirname, "..");

function makeTextObject(properties) {
    return {
        ...properties,
        set(property, value) {
            this[property] = value;
        },
        setCoords() {
            this.coordsUpdated = true;
        },
    };
}

function loadEditorExtension(objects) {
    const delegatedHandlers = [];
    const fabricHandlers = {};
    const state = {
        color: "#0088cc",
        baseUpdateCount: 0,
        renderCount: 0,
    };
    const editor = {
        fabric: {
            getActiveObjects: () => objects,
            getObjects: () => objects,
            on(eventName, handler) {
                fabricHandlers[eventName] = handler;
            },
            renderAll: () => {
                state.renderCount += 1;
            },
        },
        _init_fabric() {},
        _create_savepoint() {},
        _px2pt: value => value,
        _pt2px: value => value,
        _update_values_from_toolbox: () => {
            state.baseUpdateCount += 1;
        },
        dump: () => [],
        _add_from_data: () => null,
    };

    function jquery(selector) {
        return {
            addClass() { return this; },
            attr(name, value) {
                if (selector === "#toolbox" && name === "data-type" && value !== undefined) {
                    state.toolboxType = value;
                }
                return this;
            },
            data() { return null; },
            find() { return jquery(selector); },
            hide() { return this; },
            is() { return false; },
            on(events, delegatedSelector, handler) {
                if (selector === "#toolbox" && typeof handler === "function") {
                    delegatedHandlers.push({ events, delegatedSelector, handler });
                }
                return this;
            },
            removeClass() { return this; },
            show() { return this; },
            text() { return this; },
            toggleClass() { return this; },
            val(value) {
                if (selector === "#toolbox-col" && value !== undefined) {
                    state.color = value;
                }
                return selector === "#toolbox-col" ? state.color : "";
            },
        };
    }

    function $(selector) {
        return jquery(selector);
    }

    const source = fs.readFileSync(
        path.join(pluginRoot, "teamshifts/static/teamshifts/certificate_editor.js"),
        "utf8",
    );
    vm.runInNewContext(source, {
        $,
        editor,
        fabric: {
            Color: function (hex) {
                const value = Number.parseInt(hex.slice(1), 16);
                this._source = [(value >> 16) & 255, (value >> 8) & 255, value & 255, 1];
            },
        },
        window: { requestAnimationFrame: callback => callback() },
    });

    return { delegatedHandlers, editor, fabricHandlers, state };
}

test("group text selection exposes the color picker in the sidebar", () => {
    const template = fs.readFileSync(
        path.join(pluginRoot, "teamshifts/templates/teamshifts/certificate_editor.html"),
        "utf8",
    );
    const styles = fs.readFileSync(
        path.join(pluginRoot, "teamshifts/static/teamshifts/teamshifts.css"),
        "utf8",
    );

    assert.match(
        template,
        /class="row control-group text form-group certificate-group-color"[\s\S]*?id="toolbox-col"/,
    );
    assert.match(
        styles,
        /#toolbox\[data-type=group-text\] \.certificate-group-color\s*\{\s*display:\s*block;/,
    );
});

test("color selection updates all selected text without changing positions or other styles", () => {
    const objects = [
        makeTextObject({
            type: "textbox",
            fill: "#111111",
            left: 12,
            top: 35,
            fontSize: 20,
            fontFamily: "Open Sans",
            fontWeight: "bold",
        }),
        makeTextObject({
            type: "textarea",
            fill: "#222222",
            left: 112,
            top: 85,
            fontSize: 30,
            fontFamily: "Serif",
            fontWeight: "normal",
        }),
    ];
    const positions = objects.map(({ left, top }) => ({ left, top }));
    const relativeOffset = {
        left: objects[1].left - objects[0].left,
        top: objects[1].top - objects[0].top,
    };
    const { delegatedHandlers, editor, fabricHandlers, state } = loadEditorExtension(objects);
    const colorHandler = delegatedHandlers.find(
        ({ events, delegatedSelector }) =>
            events.includes("changeColor.ts_group_format") && delegatedSelector === "#toolbox-col",
    );

    assert.ok(colorHandler, "color picker should have a dedicated group color handler");
    fabricHandlers["selection:created"]();
    assert.equal(state.toolboxType, "group-text");
    assert.equal(state.color, "#111111");

    state.color = "#0088cc";
    editor._update_values_from_toolbox({ target: { id: "toolbox-col" } });
    colorHandler.handler();

    assert.equal(state.baseUpdateCount, 0);
    assert.deepEqual(objects.map(object => object.fill), ["#0088cc", "#0088cc"]);
    assert.deepEqual(objects.map(({ left, top }) => ({ left, top })), positions);
    assert.deepEqual(
        {
            left: objects[1].left - objects[0].left,
            top: objects[1].top - objects[0].top,
        },
        relativeOffset,
    );
            editor._update_values_from_toolbox({ target: { id: "toolbox-fontsize" } });
            assert.equal(state.baseUpdateCount, 1);
    assert.deepEqual(objects.map(({ fontSize, fontFamily, fontWeight }) => ({
        fontSize,
        fontFamily,
        fontWeight,
    })), [
        { fontSize: 20, fontFamily: "Open Sans", fontWeight: "bold" },
        { fontSize: 30, fontFamily: "Serif", fontWeight: "normal" },
    ]);
    assert.ok(objects.every(object => object.coordsUpdated));
    assert.equal(state.renderCount, 1);
});