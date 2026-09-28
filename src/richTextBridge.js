// Markdown-it content script whose only job is to ship richTextConvert.js as an
// asset. Joplin loads a content script's assets into the Rich Text editor's
// document, which is the only supported way for a plugin to run code there.
// It adds no Markdown rules, so rendering is unchanged.
module.exports = {
	default: function (_context) {
		return {
			plugin: function (_markdownIt, _options) {},
			assets: function () {
				return [{ name: 'richTextConvert.js' }];
			},
		};
	},
};
