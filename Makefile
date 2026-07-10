PLUGIN_ID := com.karman.chatbubbles
VERSION   := $(shell sed -n 's/.*"version": "\([^"]*\)".*/\1/p' plugin.json)
BUNDLE    := dist/$(PLUGIN_ID)-$(VERSION).tar.gz

.PHONY: dist clean

dist:
	rm -rf build dist
	mkdir -p build/$(PLUGIN_ID)/webapp/dist dist
	cp plugin.json build/$(PLUGIN_ID)/
	cp webapp/dist/main.js build/$(PLUGIN_ID)/webapp/dist/
	tar -C build -czf $(BUNDLE) $(PLUGIN_ID)
	@echo "Built $(BUNDLE)"

clean:
	rm -rf build dist
