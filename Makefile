BIN_FILE = firewall-man

release: frontend-build
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

# Frontend
frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

frontend-build:
	cd frontend && npm run build
	rm -rf run/web
	mkdir -p run/web
	cp -R frontend/dist/. run/web/

frontend-lint:
	cd frontend && npm run lint

.PHONY: release run images clean test check frontend-install frontend-dev frontend-build frontend-lint
