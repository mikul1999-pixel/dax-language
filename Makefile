.PHONY: install update uninstall build package

build:
	npm install
	npm run build

package: build
	npx @vscode/vsce package

install: package
	code --install-extension dax-language-vscode-0.1.0.vsix

update:
	git pull
	npm install
	npx @vscode/vsce package
	code --install-extension dax-language-vscode-0.1.0.vsix --force

uninstall:
	code --uninstall-extension dax-language-vscode