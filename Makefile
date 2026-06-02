BIN_FILE = firewall-man

release:
	cargo build --release
	cp target/release/$(BIN_FILE) .

run:
	cargo run

images:
	docker build -t micopa/firewall-man:0.1.0 .

clean:
	cargo clean
	rm -f $(BIN_FILE)

test:
	cargo test

check:
	cargo clippy
