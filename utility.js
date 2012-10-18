var esprima   = require('esprima'),
    escodegen = require('escodegen');

var BOOLEAN   = 'boolean',
    FUNCTION  = 'function',
    NUMBER    = 'number',
    OBJECT    = 'object',
    STRING    = 'string',
    UNDEFINED = 'undefined';

var defineProperty = Object.defineProperty,
    getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;

function isObject(v){
  return typeof v === OBJECT ? v !== null : typeof v === FUNCTION;
}

exports.isObject = isObject;

exports.nextTick = typeof process !== UNDEFINED ? process.nextTick : function(f){ setTimeout(f, 1) };


if (Object.create && !Object.create(null).toString) {
  var create = exports.create = Object.create;
} else {
  var create = exports.create = (function(F, empty){
    var iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.src = 'javascript:';
    empty = iframe.contentWindow.Object.prototype;
    document.body.removeChild(iframe);

    var keys = ['constructor', 'hasOwnProperty', 'propertyIsEnumerable',
                'isProtoypeOf', 'toLocaleString', 'toString', 'valueOf'];

    for (var i=0; i < keys.length; i++)
      delete empty[keys[i]];

    iframe = null = keys = null;

    function create(object){
      F.prototype = object === null ? empty : object;
      object = new F;
      F.prototype = null;
      return object;
    }

    return create;
  })(function(){});
}


function Hash(){}
Hash.prototype = create(null);

exports.Hash = Hash;


function enumerate(o){
  var keys = [], i = 0;
  for (keys[i++] in o);
  return keys;
}

exports.enumerate = enumerate;


if (Object.keys) {
  var ownKeys = exports.keys = Object.keys;
} else {
  var ownKeys = exports.keys = (function(hasOwn){
    function keys(o){
      var out = [], i=0;
      for (var k in o)
        if (hasOwn.call(o, k))
          out[i++] = k;
      return out;
    }
    return keys;
  })({}.hasOwnProperty);
}

function define(o, p, v){
  switch (typeof p) {
    case STRING:
      return defineProperty(o, p, { configurable: true, writable: true, value: v });
    case FUNCTION:
      return defineProperty(o, p.name, { configurable: true, writable: true, value: p });
    case OBJECT:
      if (p instanceof Array) {
        for (var i=0; i < p.length; i++) {
          var f = p[i];
          if (typeof f === FUNCTION && f.name) {
            var name = f.name;
          } else if (typeof f === STRING && typeof p[i+1] !== FUNCTION || !p[i+1].name) {
            var name = f;
            f = p[i+1];
          }
          if (name) {
            defineProperty(o, name, { configurable: true, writable: true, value: f });
          }
        }
      } else if (p) {
        var keys = ownKeys(p)

        for (var i=0; i < keys.length; i++) {
          var k = keys[i];
          var desc = getOwnPropertyDescriptor(p, k);
          if (desc) {
            desc.enumerable = 'get' in desc;
            defineProperty(o, k, desc);
          }
        }
      }
  }

  return o;
}

exports.define = define;



function inherit(Ctor, Super, properties, methods){
  define(Ctor, { inherits: Super });
  Ctor.prototype = create(Super.prototype, {
    constructor: { configurable: true, writable: true, value: Ctor }
  });
  properties && define(Ctor.prototype, properties);
  methods && define(Ctor.prototype, methods);
  return Ctor;
}

exports.inherit = inherit;


function partial(f, args){
  args instanceof Array || (args = [args]);
  return function(){
    var a = [], j=0;
    for (var i=0; i < args.length; i++)
      a[i] = args[i] === __ ? arguments[j++] : args[i];
    return f.apply(this, a);
  };
}

exports.partial = partial;

var __ = partial.__ = {};


function quotes(string) {
  string = (''+string).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
  var singles = 0,
      doubles = 0,
      i = string.length;

  while (i--) {
    if (string[i] === '"')
      doubles++;
    else if (string[i] === "'")
      singles++;
  }

  if (singles > doubles)
    return '"' + string.replace(/"/g, '\\"') + '"';
  else
    return "'" + string.replace(/'/g, "\\'") + "'";
}

exports.quotes = quotes;

var Visitor = exports.Visitor = (function(){
  function Cursor(parent, items){
    this.parent = parent || null;
    this.items = items;
  }

  function Visitor(node, callback, filter){
    if (typeof node === 'function') {
      this.callback = node;
      if (callback)
        this.filter = callback;
    } else {
      this.callback = callback;
      if (filter)
        this.filter = filter;
      this.reset(node);
    }
  }


  Visitor.visit = function visit(node, callback){
    if (!(node instanceof Array))
      node = [node];

    var visitor = new Visitor({}, callback);

    for (var i=0; i < node.length; i++) {
      visitor.reset(node[i]);
      visitor.next();
    }
  };

  define(Visitor.prototype, [
    function filter(){
      return true;
    },
    function reset(root){
      if (root !== undefined)
        this.root = root;
      this.stack = [];
      this.items = [];
      this.seen = new Set;
      this.queue(this.root);
      this.items.unshift(this.root);
      return this;
    },
    function next(){
      this.items.length || this.pop();
      var item = this.items.pop();

      if (item !== undefined)
        var result = this.callback(item, this.cursor);

      switch (result) {
        case RECURSE: typeof item !== 'string' && this.queue(item);
        case CONTINUE:
          this.cursor && this.next();
        case BREAK:
        default:
      }
      return this;
    },
    function queue(node, parent){
      if (this.seen.has(node))
        return;
      this.seen.add(node);

      if (this.cursor && this.items.length)
        this.stack.push(new Cursor(this.cursor, this.items));

      this.cursor = node;
      this.items = [];

      var items = [],
          index = 0;

      if (!node)
        return;

      for (var k in node)
        if (this.filter(node[k]))
          items[index++] = node[k];

      while (index--)
        this.items.push(items[index]);

      return this;
    },
    function pop(){
      var current = this.stack.pop();
      if (current) {
        this.cursor = current.parent;
        this.items = current.items;
        if (!this.items.length)
          this.pop();
      } else {
        this.cursor = null;
        this.items = [];
        this.depleted = true;
      }
      return this;
    }
  ]);



  return Visitor;
})();


var BREAK    = Visitor.BREAK    = new Number(1),
    CONTINUE = Visitor.CONTINUE = new Number(2),
    RECURSE  = Visitor.RECURSE  = new Number(3);

exports.Collector = (function(){

  function path(){
    var parts = [].slice.call(arguments);
    for (var i=0; i < parts.length; i++) {
      if (typeof parts[i] === 'function') {
        return function(o){
          for (var i=0; i < parts.length; i++) {
            if (typeof parts[i] === 'string')
              o = o[parts[i]];
            else if (typeof parts[i] === 'function')
              o = parts[i](o);
          }
          return o;
        };
      }
    }

    return function(o){
      for (var i=0; i < parts.length; i++)
        o = o[parts[i]];
      return o;
    };
  }



  function Collector(handlers){
    this.handlers = Object.create(null);
    for (var k in handlers) {
      if (handlers[k] instanceof Array)
        this.handlers[k] = path(handlers[k])
      else
        this.handlers[k] = handlers[k];
    }
    var self = this;
    return function(node){
      return self.collect(node);
    };
  }

  inherit(Collector, Visitor, [
    function collect(node, parent){
      var items = this.collected = [];
      this.reset(node);
      this.next();
      this.collected = null;
      return items;
    },
    function callback(node, parent){
      if (!node) return CONTINUE;
      var handler = this.handlers[node.type];
      if (handler) {
        if (handler === RECURSE || handler === CONTINUE) {
          return handler;
        } else {
          var item = handler(node);
          if (item !== undefined)
            this.collected.push(item);
        }
      } else if (node instanceof Array) {
        return RECURSE;
      }
      return CONTINUE;
    },
  ]);

  return Collector;
})();



function parse(src, options){
  return esprima.parse(src, options || parse.options);
}

exports.parse = parse;

parse.options = {
  loc    : false,
  range  : false,
  raw    : false,
  tokens : false,
  comment: false
}

function decompile(ast, options){
  return escodegen.generate(ast, options || decompile.options);
}

exports.decompile = decompile;

decompile.options = {
  comment: false,
  allowUnparenthesizedNew: true,
  format: {
    indent: {
      style: '  ',
      base: 0,
    },
    json       : false,
    renumber   : false,
    hexadecimal: true,
    quotes     : 'single',
    escapeless : true,
    compact    : false,
    parentheses: true,
    semicolons : true
  }
};





function Emitter(){
  '_events' in this || define(this, '_events', create(null));
}

exports.Emitter = Emitter;

define(Emitter.prototype, [
  function on(events, handler){
    events.split(/\s+/).forEach(function(event){
      if (!(event in this))
        this[event] = [];
      this[event].push(handler);
    }, this._events);
  },
  function off(events, handler){
    events.split(/\s+/).forEach(function(event){
      if (event in this) {
        var index = '__index' in handler ? handler.__index : this[event].indexOf(handler);
        if (~index)
          this[event].splice(index, 1)
      }
    }, this._events);
  },
  function once(events, handler){
    this.on(events, function once(){
      this.off(events, once);
      handler.apply(this, arguments);
    });
  },
  function emit(event){
    if (this._events['*']) {
      var handlers = this._events['*'];
      for (var i=0; i < handlers.length; i++)
        handlers[i].apply(this, arguments);
    }

    if (this._events[event]) {
      var args = slice.call(arguments, 1),
          handlers = this._events[event];
      for (var i=0; i < handlers.length; i++)
        handlers[i].apply(this, args);
    }
  }
]);



function PropertyList(list){
  this.hash = new Hash;
  define(this, 'keys', []);
  this.add(list);
}

exports.PropertyList = PropertyList;

define(PropertyList.prototype, [
  function add(key){
    if (typeof key === 'number')
      key += '';

    if (typeof key === 'string') {
      if (!(key in this.hash)) {
        this.hash[key] = this.keys.push(key) - 1;
      }
    } else if (key instanceof PropertyList) {
      key.forEach(function(key){
        this.add(key);
      }, this);
    } else if (key instanceof Array) {
      for (var i=0; i < key.length; i++)
        this.add(key[i]);
    }
  },
  function remove(key){
    if (key in this.hash) {
      this.keys.splice(this.hash[key], 1);
      delete this.hash[key];
      return true;
    } else {
      return false;
    }
  },
  function has(key){
    return key in this.hash;
  },
  function forEach(callback, context){
    context = context || this;
    for (var i=0; i < this.keys.length; i++)
      callback.call(context, this.keys[i], i, this);
  },
  function map(callback, context){
    var out = new PropertyList;
    context = context || this;
    for (var i=0; i < this.keys.length; i++)
      out.push(callback.call(context, this.keys[i], i, this));
    return out;
  },
  function filter(callback, context){
    var out = new PropertyList;
    context = context || this;
    for (var i=0; i < this.keys.length; i++) {
      if (callback.call(context, this.keys[i], i, this))
        out.add(this.keys[i]);
    }
    return out;
  },
  function clone(){
    return new PropertyList(this);
  },
  function toArray(){
    return this.keys.slice();
  },
]);
