import createComponent from '../../../helpers/component.js';
import { InteractableComponentType } from '../../../types/types.js';
import { handleQuoteSelect } from '../../../utils/quote.js';

createComponent({
  type: InteractableComponentType.SelectMenu,
  custom_id: 'quote-select',
  args: ['session_id', 'option'] as const,
  acknowledge: true,
  async run(interaction, args, api) {
    await handleQuoteSelect(interaction, args.session_id, args.option, api);
  },
});
