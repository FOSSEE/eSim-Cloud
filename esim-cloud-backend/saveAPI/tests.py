from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from saveAPI.models import StateSave

User = get_user_model()


class PinnedFieldOrderingTest(TestCase):
    """
    Tests that UserSavesView returns pinned=True saves before
    pinned=False saves, regardless of save_time ordering.
    """

    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser_pinned',
            password='testpassword123',
            email='testuser_pinned@example.com',
        )
        self.client.force_authenticate(user=self.user)

        # Create an UNPINNED save first (older in DB order)
        self.unpinned_save = StateSave.objects.create(
            name='Unpinned Circuit',
            description='This circuit is not pinned',
            data_dump='<xml>unpinned</xml>',
            owner=self.user,
            version='v1',
            branch='master',
            is_arduino=False,
            pinned=False,
        )

        # Create a PINNED save second (newer in DB order)
        self.pinned_save = StateSave.objects.create(
            name='Pinned Circuit',
            description='This circuit is pinned to the top',
            data_dump='<xml>pinned</xml>',
            owner=self.user,
            version='v1',
            branch='master',
            is_arduino=False,
            pinned=True,
        )

    def test_pinned_saves_appear_first_in_list(self):
        """
        GET /save/list must return the pinned save before the unpinned
        save, even when both belong to the same user.
        """
        url = reverse('listSaves')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.json()
        self.assertGreaterEqual(
            len(data), 2,
            'Expected at least 2 saves in response'
        )

        # Collect save_ids in the order returned by the API
        returned_ids = [str(item['save_id']) for item in data]

        pinned_index = returned_ids.index(str(self.pinned_save.save_id))
        unpinned_index = returned_ids.index(str(self.unpinned_save.save_id))

        self.assertLess(
            pinned_index,
            unpinned_index,
            'Pinned save must appear before unpinned save in /save/list response. '
            f'Got pinned at index {pinned_index}, unpinned at index {unpinned_index}.'
        )

    def test_pinned_field_present_in_response(self):
        """
        Each item in the /save/list response must include the pinned field.
        """
        url = reverse('listSaves')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        for item in data:
            self.assertIn(
                'pinned', item,
                f"'pinned' field missing from save {item.get('save_id')}"
            )

    def test_pinned_field_values_are_correct(self):
        """
        The pinned field value in the response must match what was set
        on the model instance.
        """
        url = reverse('listSaves')
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        by_save_id = {item['save_id']: item for item in data}

        self.assertTrue(
            by_save_id[str(self.pinned_save.save_id)]['pinned'],
            'pinned_save should have pinned=True in the response'
        )
        self.assertFalse(
            by_save_id[str(self.unpinned_save.save_id)]['pinned'],
            'unpinned_save should have pinned=False in the response'
        )
