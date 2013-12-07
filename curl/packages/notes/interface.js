define([
	'jquery', 'underscore', 'doubleunderscore', 'blocks',
	'text!./main.jst', 'text!./list.jst', 'text!./item.jst', 'text!./editor.jst',
	'css!./interface.css'
], function(
	$, _, __, Blocks,
	main_template_string, list_template_string, item_template_string, editor_template_string
){
	var Note = Blocks.Model.inherits(function(){
		this.data = {
			hex: '',
			title: '',
			revision_refs: [],
			context_revision: '',
		};
	}, {});

	var Notes = Blocks.Collection.inherits(function(){

	}, {});


	var List = Blocks.View.inherits(function(){
		var self = this;

		self.collection = new Notes();
		self.collection.on('change', self.render, self);

		self.element.innerHTML = list_template_string;
		self.target = self.$element.find('.item_target')[0];
		self.$search = self.$element.find('.search');

		$(document).on('keyup', function(e){
			switch (e.which) {
			case 27: // esc
				self.$search.focus().select();
			break;
			};
		});
	}, {
		tag_name: 'nav',
		element_classes: 'list pane',

		events: [
			{ event_name: 'input', selector: '.search', function_name: 'search' },
			{ event_name: 'click', selector: '[data-action="new"]', function_name: 'make' }
		],

		close_menu: function(){
			$('html').removeClass('menu_open');
		},

		render: function(){
			var frag = document.createDocumentFragment();
			var counter = 0, limit = this.collection.length;
			while (counter < limit) {
				var item = new Item(this.collection[counter]);
				frag.appendChild(item.element);

				item.on('select', this.select, this);
				counter++;
			};

			this.target.innerHTML = '';
			this.target.appendChild(frag);
		},

		search: function(){
			var self = this;
			var q = this.$search.val();
	
			if (q) {
				$.ajax({
					type: 'GET',
					url: '/search',
					dataType: 'json',
					data: { q: q },
					success: function (data) {
						self.collection.removeAll();

						var counter = 0, limit = data.length;
						while (counter < limit) {
							var note = new Note();
							note.ingest(data[counter]);
							self.collection.push(note);
							counter++;
						};
					
					}
				});
			} else {
				self.collection.removeAll();
			};
		},

		make: function(){
			var n = new Note();
			n.set('title', this.$search.val());

			this.fire('select', n);
			this.close_menu();
		},

		select: function(item, model){
			this.fire('select', model);
		}		
	});

	var Item = Blocks.View.inherits(function(model){
		this.model = model;
		this.model.on('change', this.render, this);

		this.render();
	}, {
		tag_name: 'article',
		comp_template: __.template(item_template_string),
		events: [
			{ event_name: 'click', selector: '*', function_name: 'select' },
		],

		render: function(){
			this.element.innerHTML = this.comp_template(this.model.data);
		},

		select: function(){
			$('html').removeClass('menu_open');
			this.fire('select', this.model);
		}
	});

	var Editor = Blocks.View.inherits(function(){
		this.model = new Note();

		this.element.innerHTML = this.comp_template(this.model);
		this.$textarea = this.$element.find('textarea.content');
		this.$title = this.$element.find('input.title');
		this.$info = this.$element.find('span.info');
		this.$revisions = this.$element.find('select.revisions');

		this.render();
	}, {
		tag_name: 'section',
		element_classes: 'editor pane',
		comp_template: __.template(editor_template_string),

		events: [
			{ event_name: 'change', selector: 'select.revisions', function_name: 'select_revision' },
			{ event_name: 'click', selector: '[data-action="save"]', function_name: 'save' },
			{ event_name: 'click', selector: '[data-action="change_title"]', function_name: 'patch' }
		],

		clear: function(){
			this.$title.val('');
			this.$info.html('');
			this.$textarea.val('');
		},

		render: function(){
			this.$title.val(this.model.get('title'));
			this.$info.html(this.model.get('hex'));

			var frag = document.createDocumentFragment();
			var revs = this.model.get('revision_refs'), counter = revs.length;

			while (counter--) {
				var option = document.createElement('option');
				option.innerHTML = option.value = revs[counter];

				if (option.value == this.model.get('context_revision')) {
					option.selected = true;
				};

				frag.appendChild(option);
			};

			this.$revisions.html('');
			this.$revisions.append(frag);
		},

		select_revision: function () {
			this.model.set('context_revision', this.$revisions.val());
			this.display_revision(this.$revisions.val());
		},

		display_revision: function (hex) {
			var self = this;

			$.ajax({
				type: 'GET',
				url: hex,
				dataType: 'text',
				success: function (data) {
					self.$textarea.val(data);
				},
			});
		},

		edit: function(item, model){
			this.clear();

			this.model = model;

			var rr = this.model.get('revision_refs');
			var last = rr[rr.length-1];

			this.model.set('context_revision', last);

			if (last) {
				this.display_revision(last);
			}

			this.render();
		},

		patch: function(){
			var self = this;

			if (self.model.get('hex') === '') {
				return;
			};

			$.ajax({
				type: 'PATCH',
				url: self.model.get('hex'),
				dataType: 'text',
				processData: false,
				data: JSON.stringify({ title: self.$title.val() }),
				contentType: 'application/json',
				success: function(){
					self.model.set('title', self.$title.val());
				},
			});
		},

		save: function(){
			var self = this;
			var queue = new __.Queue();

			// check if new note
			if (this.model.get('hex') === '') {
				self.model.set('title', self.$title.val());

				queue.add(function(){
					$.ajax({
						type: 'POST',
						url: '/new',
						dataType: 'text',
						processData: false,
						data: JSON.stringify({ title: self.model.get('title') }),
						contentType: 'application/json',
						success: function(hex){
							self.model.set('hex', hex);
							queue.step();
						}
					});
				});
			} else if (this.model.get('title') === '') {
				return;
			};

			queue.add(function(){
				$.ajax({
					type: 'POST',
					url: self.model.get('hex'),
					dataType: 'text',
					processData: false,
					data: self.$textarea.val(),
					contentType: 'application/json',
					success: function (data) {
						var revs = self.model.get('revision_refs');
						revs.push(data);
						self.model.set('revision_refs', revs);
						self.model.set('context_revision', data);

						self.render();
						self.fire('save');
						queue.step();
					},
				});
			});

			queue.step();
		}
	});

	var Interface = Blocks.View.inherits(function(){
		this.element.innerHTML = main_template_string;

		this.list = new List();
		this.editor = new Editor();

		this.list.on('select', this.editor.edit, this.editor);
		this.editor.on('save', this.list.search, this.list);

		this.element.appendChild(this.list.element);
		this.element.appendChild(this.editor.element);
	}, {
		element_classes: 'notes_interface',

		events: [
			{ event_name: 'click', selector: '[data-action="menu"]', function_name: 'menu' },
		],

		menu: function(){
			$('html').toggleClass('menu_open');
		}
	});


	return Interface;
});
