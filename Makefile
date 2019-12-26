SHELL = bash
PATH := $(PWD)/node_modules/.bin:$(PATH)

.PHONY: all clean

out = fahrplan.html style.css

all: $(out)

clean:
	rm -fv $(out)

fahrplan.html: fahrplan.csv format.js fahrplan.html.pug Makefile
	node ./format.js fahrplan.html.pug < $< > $@

%.css: %.sass Makefile
	@mkdir -p $(shell dirname $@)
	node-sass --output-style compressed $< > $@
