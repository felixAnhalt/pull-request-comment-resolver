import {main} from "./main";

main().catch((e) => {
    console.error("Unhandled promise rejection in main:", e);
    process.exit(1);
});
