'use strict';

/* global Util, DOM */

const itype = require('itype/legacy');
const Emitify = require('emitify/legacy');
const inherits = require('inherits');
const rendy = require('rendy/legacy');
const wraptile = require('wraptile/legacy');
const exec = require('execon');

const Images = require('./dom/images');
const {
    unregisterSW,
} = require('./sw/register');

const join = require('join-io/www/join');
const jonny = require('jonny/legacy');
const currify = require('currify/legacy');

const bind = (f, ...a) => () => f(...a);
const noop = () => {};

const {
    apiURL,
    formatMsg,
    buildFromJSON,
} = require('../common/cloudfunc');

/* global Util, DOM */

inherits(CloudCmdProto, Emitify);

module.exports = new CloudCmdProto(Util, DOM);

function CloudCmdProto(Util, DOM) {
    let Key;
    let Debug;
    let Listeners;
    
    const log = (str) => {
        if (!Debug)
            return;
        
        console.log(str);
    };
    
    Emitify.call(this);
    
    const CloudCmd = this;
    const Info = DOM.CurrentInfo;
    const Storage = DOM.Storage;
    const Files = DOM.Files;
    
    this.log = log;
    this.PREFIX = '';
    this.PREFIX_URL = '';
    this.DIRCLIENT = '/dist/';
    this.DIRCLIENT_MODULES = this.DIRCLIENT + 'modules/';
    
    this.MIN_ONE_PANEL_WIDTH    = 1155;
    this.HOST                   = location.origin ||
                                  location.protocol + '//' + location.host;
    
    const TITLE = 'Cloud Commander';
    this.TITLE = TITLE;
    
    this.sort = {
        left: 'name',
        right: 'name',
    };
    
    this.order = {
        left: 'asc',
        right: 'asc',
    };
    
    log.enable = () => {
        Debug = true;
    };
    
    log.disable = () => {
        Debug = false;
    };
    
    const kebabToCamelCase = Util.kebabToCamelCase;
    
    /**
     * Функция привязываеться ко всем ссылкам и
     *  загружает содержимое каталогов
     *
     * @param params - {
     *          paramLink - ссылка
     *          needRefresh - необходимость обязательной загрузки данных с сервера
     *          panel
     *      }
     * @param callback
     */
    this.loadDir = (params, callback) => {
        const p = params;
        
        const refresh = p.isRefresh;
        const panel = p.panel;
        const history = p.history;
        const noCurrent = p.noCurrent;
        const currentName = p.currentName;
        
        let panelChanged;
        if (!noCurrent)
            if (panel && panel !== Info.panel) {
                DOM.changePanel();
                panelChanged = true;
            }
        
        let imgPosition;
        if (panelChanged || refresh || !history)
            imgPosition = 'top';
        
        Images.show.load(imgPosition, panel);
        
        /* загружаем содержимое каталога */
        ajaxLoad(p.path, {
            refresh,
            history,
            noCurrent,
            currentName,
        }, panel, callback);
    };
    
    /**
     * function load modules
     * @params = {name, path, func, dobefore, arg}
     */
    function loadModule(params) {
        if (!params)
            return;
        
        let path = params.path;
        const name = params.name || path && kebabToCamelCase(path);
        const func = params.func;
        const funcName = params.funcName;
        const doBefore = params.dobefore;
        
        const isContain = /\.js/.test(path);
        
        if (!isContain)
            path += '.js';
        
        if (CloudCmd[name])
            return;
        
        CloudCmd[name] = (...args) => {
            const prefix = CloudCmd.PREFIX;
            const pathFull = prefix + CloudCmd.DIRCLIENT_MODULES + path;
            
            exec(doBefore);
            
            const done = (error) => {
                const Proto = CloudCmd[name];
                
                if (error || !itype.function(Proto))
                    return;
                
                CloudCmd[name] = new Proto(...args);
            };
            
            return DOM.load.js(pathFull, func || done);
        };
        
        CloudCmd[name][funcName] = CloudCmd[name];
    }
    
    /**
     * Конструктор CloudClient, который
     * выполняет весь функционал по
     * инициализации
     */
    this.init = (prefix, config) => {
        const func = bind(exec.parallel, [
            initModules,
            baseInit,
            loadPlugins,
            loadStyle,
            exec.with(CloudCmd.route, location.hash),
        ], noop);
        
        const {
            load,
            loadJquery,
        } = DOM;
        
        const funcBefore  = (callback) => {
            const src = prefix + CloudCmd.DIRCLIENT_MODULES + 'polyfill.js';
            loadJquery(wraptile(load.js, src, callback));
        };
        
        CloudCmd.PREFIX = prefix;
        CloudCmd.PREFIX_URL = prefix + apiURL;
        
        CloudCmd.config = (key) => config[key];
        CloudCmd.config.if = currify((key, fn, a) => config[key] && fn(a));
        CloudCmd._config = (key, value) => {
            /*
             * should be called from config.js only
             * after successful update on server
             */
             
            if (key === 'password')
                return;
            
            config[key] = value;
        };
        
        if (config.oneFilePanel)
            CloudCmd.MIN_ONE_PANEL_WIDTH = Infinity;
        
        exec.if(document.body.scrollIntoViewIfNeeded, func, funcBefore);
    };
    
    function loadStyle(callback) {
        const prefix = CloudCmd.PREFIX;
        const name = prefix + '/dist/cloudcmd.common.css';
        
        DOM.load.css(name, callback);
    }
    
    function loadPlugins(callback) {
        const prefix = CloudCmd.PREFIX;
        const plugins = prefix + '/plugins.js';
        
        DOM.load.js(plugins, callback);
    }
    
    this.join = (urls) => {
        const prefix  = CloudCmd.PREFIX;
        
        if (!Array.isArray(urls))
            throw Error('urls should be array!');
        
        const noPrefixUrls = urls.map((url) => {
            return url.replace(prefix, '');
        });
        
        return prefix + join(noPrefixUrls);
    };
    
    this.route = (path) => {
        const query = path.split('/');
        
        if (!path)
            return;
        
        const [kebabModule] = query;
        const module = kebabToCamelCase(kebabModule.slice(1));
        
        const file = query[1];
        const current = DOM.getCurrentByName(file);
        
        if (file && !current) {
            const msg = formatMsg('set current file', file, 'error');
            CloudCmd.log(msg);
            return;
        }
        
        DOM.setCurrentFile(current);
        
        CloudCmd.execFromModule(module, 'show');
    };
    
    this.logOut = () => {
        const url = CloudCmd.PREFIX + '/logout';
        const error = () => document.location.reload();
        
        DOM.Storage.clear();
        unregisterSW();
        DOM.load.ajax({
            url,
            error,
        });
    };
    
    function initModules(callback) {
        exec.if(CloudCmd.Key, () => {
            Key = new CloudCmd.Key();
            CloudCmd.Key = Key;
            Key.bind();
        }, (func) => {
            /* привязываем клавиши к функциям */
            const path = 'key.js';
            
            loadModule({
                path,
                func
            });
        });
        
        Files.get('modules', (error, modules) => {
            const showLoad = Images.show.load;
            
            const doBefore = {
                'edit': showLoad,
                'menu': showLoad,
            };
            
            const load = (name, path, dobefore) => {
                const isTmpl = path === 'template';
                const funcName = isTmpl ? 'get' : 'show';
                
                loadModule({
                    name,
                    path,
                    dobefore,
                    funcName,
                });
            };
            
            if (!modules)
                modules = [];
            
            modules.local.forEach((module) => {
                load(null, module, doBefore[module]);
            });
            
            callback();
        });
    }
    
    function baseInit(callback) {
        const files = DOM.getFiles();
        
        CloudCmd.on('current-file', DOM.updateCurrentInfo);
        
        /* выделяем строку с первым файлом */
        if (files)
            DOM.setCurrentFile(files[0], {
                // when hash is present
                // it should be handled with this.route
                // overwre otherwise
                history: !location.hash
            });
        
        const dirPath = DOM.getCurrentDirPath();
        Listeners = CloudCmd.Listeners;
        Listeners.init();
        
        const panels = getPanels();
        panels.forEach(Listeners.setOnPanel);
        
        Listeners.initKeysPanel();
        
        if (!CloudCmd.config('dirStorage'))
            return callback();
        
        Storage.get(dirPath, (error, data) => {
            if (!data) {
                data = getJSONfromFileTable();
                Storage.set(dirPath, data);
            }
            callback();
        });
    }
    
    function getPanels() {
        const panels = ['left'];
        
        if (CloudCmd.config('oneFilePanel'))
            return panels;
        
        return [
            ...panels,
            'right',
        ];
    }
    
    this.execFromModule = (moduleName, funcName, ...args) => {
        const obj = CloudCmd[moduleName];
        const isObj = itype.object(obj);
        
        exec.if(isObj, () => {
            const obj = CloudCmd[moduleName];
            const func = obj[funcName];
            
            func(...args);
        }, obj);
    };
    
    this.refresh = (options = {}, callback) => {
        if (!callback && typeof options === 'function') {
            callback = options;
            options = {};
        }
       
        const panel = options.panel || Info.panel;
        const path = DOM.getCurrentDirPath(panel);
        
        const isRefresh = true;
        const history = false;
        const noCurrent = options ? options.noCurrent : false;
        const currentName = options.currentName;
        
        CloudCmd.loadDir({
            path,
            isRefresh,
            history,
            panel,
            noCurrent,
            currentName,
        }, callback);
    };
    
    /**
     * Функция загружает json-данные о Файловой Системе
     * через ajax-запрос.
     * @param path - каталог для чтения
     * @param options
     * { refresh, history } - необходимость обновить данные о каталоге
     * @param panel
     * @param callback
     *
     */
    function ajaxLoad(path, options, panel, callback) {
        const create = (error, json) => {
            const RESTful = DOM.RESTful;
            const name = options.currentName || Info.name;
            const obj = jonny.parse(json);
            const isRefresh = options.refresh;
            const noCurrent = options.noCurrent;
            
            if (!isRefresh && json)
                return createFileTable(obj, panel, options, callback);
            
            const position = DOM.getPanelPosition(panel);
            const sort = CloudCmd.sort[position];
            const order = CloudCmd.order[position];
            
            const query = rendy('?sort={{ sort }}&order={{ order }}', {
                sort,
                order,
            });
            
            RESTful.read(path + query, 'json', (error, obj) => {
                if (error)
                    return;
                
                options.sort = sort;
                options.order = order;
                
                createFileTable(obj, panel, options, () => {
                    if (isRefresh && !noCurrent)
                        DOM.setCurrentByName(name);
                    
                    exec(callback);
                });
                
                if (!CloudCmd.config('dirStorage'))
                    return;
                
                Storage.set(path, obj);
            });
        };
        
        if (!options)
            options    = {};
        
        CloudCmd.log('reading dir: "' + path + '";');
        
        if (!CloudCmd.config('dirStorage'))
            return create();
        
        Storage.get(path, create);
    }
    
    /**
     * Функция строит файловую таблицу
     * @param json  - данные о файлах
     * @param panelParam
     * @param history
     * @param callback
     */
    function createFileTable(json, panelParam, options, callback) {
        const {
            history,
            noCurrent,
        } = options;
        
        const names = ['file', 'path', 'link', 'pathLink'];
        
        Files.get(names, (error, templFile, templPath, templLink, templPathLink) => {
            const Dialog = DOM.Dialog;
            const panel = panelParam || DOM.getPanel();
            
            const {
                dir,
                name,
            } = Info;
            
            if (error)
                return Dialog.alert(TITLE, error.responseText);
            
            const childNodes = panel.childNodes;
            let i = childNodes.length;
            
            while (i--)
                panel.removeChild(panel.lastChild);
            
            panel.innerHTML = buildFromJSON({
                sort        : options.sort,
                order       : options.order,
                data        : json,
                id          : panel.id,
                prefix      : CloudCmd.PREFIX,
                template    : {
                    file        : templFile,
                    path        : templPath,
                    pathLink    : templPathLink,
                    link        : templLink
                }
            });
            
            Listeners.setOnPanel(panel);
            
            if (!noCurrent) {
                let current;
                
                if (name === '..' && dir !== '/')
                    current = DOM.getCurrentByName(dir);
                
                if (!current)
                    current = DOM.getFiles(panel)[0];
                
                DOM.setCurrentFile(current, {
                    history,
                });
                
                CloudCmd.emit('active-dir', Info.dirPath);
            }
            
            exec(callback);
        });
    }
    
    /**
     * Функция генерирует JSON из html-таблицы файлов и
     * используеться при первом заходе в корень
     */
    function getJSONfromFileTable() {
        const path = DOM.getCurrentDirPath();
        const infoFiles = Info.files || [];
        
        const notParent = (current) => {
            const name = DOM.getCurrentName(current);
            return name !== '..';
        };
        
        const parse = (current) => {
            const name = DOM.getCurrentName(current);
            const size = DOM.getCurrentSize(current);
            const owner = DOM.getCurrentOwner(current);
            const mode = DOM.getCurrentMode(current);
            const date = DOM.getCurrentDate(current);
            
            return {
                name,
                size,
                mode,
                owner,
                date,
            };
        };
        
        const files = infoFiles
            .filter(notParent)
            .map(parse);
        
        const fileTable = {
            path,
            files,
        };
        
        return fileTable;
    }
    
    this.goToParentDir = () => {
        const dir = Info.dir;
        const {
            dirPath,
            parentDirPath,
        } = Info;
        
        if (dirPath === parentDirPath)
            return;
        
        const path = parentDirPath;
        
        CloudCmd.loadDir({path}, () => {
            const {panel} = Info;
            const current = DOM.getCurrentByName(dir);
            const first = DOM.getFiles(panel)[0];
            
            DOM.setCurrentFile(current || first, {
                history
            });
        });
    };
}

