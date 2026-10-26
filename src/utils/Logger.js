export const TYPE = {
    info: {
        name: 'Info',
        priority: 2,
        textColor: 'green'
    },
    verbose: { 
        name: 'Verbose', 
        priority: 1,
        textColor: 'yellow'
    }
};

export class Logger {

    constructor(level) {
        // Not available on a server, and some browsers refuse access (private mode, blocked site data).
        try {
            if(typeof sessionStorage !== 'undefined' && sessionStorage.getItem('CSVBOX_DEBUG_LEVEL')) {
                level = sessionStorage.getItem('CSVBOX_DEBUG_LEVEL');
            }
        } catch (e) {
            // keep the level that was passed in
        }
        if(TYPE[level]) {
            this.debugLevelPriority = TYPE[level].priority;
        }
    }

    shouldLog(priority) {
        return priority >= this.debugLevelPriority;
    }

    info(...data) {
        this.log(TYPE.info, ...data);
    }

    verbose(...data) {
        this.log(TYPE.verbose, ...data);
    }

    log() {
        let [level, ...data] = arguments;
        if(this.shouldLog(level.priority)) {
            console.log(`%c[CSVBox]%c[${level.name}]`, "color:blue;font-weight:bold;", `color:${level.textColor};font-weight:bold;`, ...data);    
        }
    }
}