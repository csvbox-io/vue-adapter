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
        if(sessionStorage && sessionStorage.getItem('CSVBOX_DEBUG_LEVEL')) {
            level = sessionStorage.getItem('CSVBOX_DEBUG_LEVEL');
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