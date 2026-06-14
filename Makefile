BIN_FILE = firewall-man

release:
	cd backend && cargo build --release
	cp backend/target/release/$(BIN_FILE) .

run:
	cd backend && cargo run

images:
	docker build -t Miitai/firewall-man:0.1.0 .

clean:
	cd backend && cargo clean
	rm -f $(BIN_FILE)

test:
	cd backend && cargo test

check:
	cd backend && cargo clippy
